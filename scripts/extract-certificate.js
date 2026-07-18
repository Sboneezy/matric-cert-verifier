/**
 * Phase 1: Certificate extraction proof of concept.
 *
 * Sends a certificate (PDF or image) to Claude and gets back structured
 * fields with a per-field confidence rating. Does NOT touch a database yet —
 * this is deliberately isolated so we can validate extraction quality on
 * real certificates before building anything around it.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/extract-certificate.js path/to/cert.pdf
 */

const fs = require('fs');
const path = require('path');
const { validateIdNumber } = require('../lib/validators/saIdValidation');

const MODEL = 'claude-haiku-4-5-20251001'; // cheap + good enough for structured extraction

const EXTRACTION_PROMPT = `You are extracting data from a South African matric/school-leaving
certificate or Statement of Results, for verification purposes.

Extract the following fields. For EACH field, return a value and a
confidence level of "high", "medium", or "low".

If a field is not present, not legible, or you are not reasonably certain,
return null for the value and "low" for confidence. DO NOT guess a
plausible-looking value — a wrong value that looks confident is worse
than an honest null.

Fields to extract:
- surname (as printed on the certificate)
- full_names (as printed on the certificate)
- id_number (13-digit SA ID number, if present)
- date_of_birth (only if id_number is not present or not legible; format YYYY-MM-DD)
- qualification_type (exact wording as printed, e.g. "National Senior Certificate",
  "Senior Certificate", "Replacement National Senior Certificate", "IEB", etc.)
- qualification_year (the year the qualification was awarded/examined)
- certificate_number (if present)
- examination_number (if present — common on Statements of Results)

Return ONLY valid JSON in exactly this structure, with no other text,
no markdown code fences, nothing before or after it:

{
  "surname": {"value": "...", "confidence": "high|medium|low"},
  "full_names": {"value": "...", "confidence": "high|medium|low"},
  "id_number": {"value": "...", "confidence": "high|medium|low"},
  "date_of_birth": {"value": "...", "confidence": "high|medium|low"},
  "qualification_type": {"value": "...", "confidence": "high|medium|low"},
  "qualification_year": {"value": "...", "confidence": "high|medium|low"},
  "certificate_number": {"value": "...", "confidence": "high|medium|low"},
  "examination_number": {"value": "...", "confidence": "high|medium|low"}
}`;

function guessMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  throw new Error(`Unsupported file type: ${ext}`);
}

async function extractCertificate(filePath) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Set ANTHROPIC_API_KEY in your environment before running this.');
  }

  const mediaType = guessMediaType(filePath);
  const base64Data = fs.readFileSync(filePath).toString('base64');

  const contentBlock =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [contentBlock, { type: 'text', text: EXTRACTION_PROMPT }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text content in API response');

  let extracted;
  try {
    extracted = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(`Failed to parse model output as JSON:\n${textBlock.text}`);
  }

  return extracted;
}

function applyIdValidation(extracted) {
  const idValue = extracted.id_number?.value;
  const dobValue = extracted.date_of_birth?.value;

  if (!idValue) return extracted;

  const validation = validateIdNumber(idValue, dobValue);

  if (validation.recommendation === 'downgrade_to_low_checksum_failed') {
    extracted.id_number.confidence = 'low';
    extracted.id_number.validation_note = 'Failed SA ID checksum — likely misread digit(s)';
  } else if (validation.recommendation === 'downgrade_to_low_dob_mismatch') {
    extracted.id_number.confidence = 'low';
    extracted.id_number.validation_note = 'Date of birth encoded in ID does not match extracted DOB';
  } else {
    extracted.id_number.validation_note = 'Passed checksum validation';
  }

  return extracted;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/extract-certificate.js <path-to-certificate>');
    process.exit(1);
  }

  console.log(`Extracting: ${filePath}\n`);
  const extracted = await extractCertificate(filePath);
  const validated = applyIdValidation(extracted);

  console.log(JSON.stringify(validated, null, 2));
}

main().catch((err) => {
  console.error('Extraction failed:', err.message);
  process.exit(1);
});
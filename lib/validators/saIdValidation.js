/**
 * South African ID number validation.
 * Format: YYMMDD SSSS C A Z (13 digits)
 *   - YYMMDD: date of birth
 *   - SSSS: gender sequence (0000-4999 female, 5000-9999 male)
 *   - C: citizenship (0 = SA citizen, 1 = permanent resident)
 *   - A: usually 8 or 9 (historically race, now unused/8)
 *   - Z: Luhn checksum digit
 */

function luhnChecksumValid(idNumber) {
  if (!/^\d{13}$/.test(idNumber)) return false;

  const digits = idNumber.split('').map(Number);

  // Sum of digits at odd positions (1-indexed: 1,3,5,7,9,11)
  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) {
    oddSum += digits[i];
  }

  // Digits at even positions (2,4,6,8,10,12) concatenated as a number, doubled
  let evenDigitsStr = '';
  for (let i = 1; i < 12; i += 2) {
    evenDigitsStr += digits[i];
  }
  const evenDoubled = (parseInt(evenDigitsStr, 10) * 2).toString();
  const evenSum = evenDoubled.split('').reduce((sum, d) => sum + Number(d), 0);

  const total = oddSum + evenSum;
  const checkDigit = (10 - (total % 10)) % 10;

  return checkDigit === digits[12];
}

function extractDobFromId(idNumber) {
  if (!/^\d{6}/.test(idNumber)) return null;
  const yy = idNumber.slice(0, 2);
  const mm = idNumber.slice(2, 4);
  const dd = idNumber.slice(4, 6);

  // Basic century inference: assume 00-25 -> 2000s, 26-99 -> 1900s.
  // This is a heuristic, not foolproof (a system built on real volume
  // should let the qualification year help disambiguate).
  const century = Number(yy) <= 25 ? '20' : '19';
  return `${century}${yy}-${mm}-${dd}`;
}

/**
 * Cross-checks an extracted ID number against an extracted/typed date of birth.
 * Returns a validation result used to adjust confidence — this is the
 * "cheap deterministic double-check on top of AI extraction" layer.
 */
function validateIdNumber(idNumber, extractedDob) {
  const result = {
    idNumber,
    checksumValid: null,
    dobFromId: null,
    dobMatchesExtracted: null,
    recommendation: null,
  };

  if (!idNumber) {
    result.recommendation = 'no_id_provided';
    return result;
  }

  result.checksumValid = luhnChecksumValid(idNumber);
  result.dobFromId = extractDobFromId(idNumber);

  if (!result.checksumValid) {
    result.recommendation = 'downgrade_to_low_checksum_failed';
    return result;
  }

  if (extractedDob && result.dobFromId) {
    result.dobMatchesExtracted = result.dobFromId === extractedDob;
    if (!result.dobMatchesExtracted) {
      result.recommendation = 'downgrade_to_low_dob_mismatch';
      return result;
    }
  }

  result.recommendation = 'keep_model_confidence';
  return result;
}

module.exports = { luhnChecksumValid, extractDobFromId, validateIdNumber };
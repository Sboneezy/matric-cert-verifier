const nodemailer = require("nodemailer");

/**
 * Email Submission Service
 * 
 * Sends verification requests to providers via email
 * with attached Word/Excel templates.
 * 
 * Providers accept submissions via email:
 * - Umalusi: verification@umalusi.org.za
 * - SAQA: verifications@saqa.org.za
 * - Department of Education: verifications@education.gov.za
 */
class EmailSubmissionService {
    
    constructor(config = {}) {
        this.transporter = null;
        this.config = {
            host: config.host || process.env.SMTP_HOST,
            port: config.port || parseInt(process.env.SMTP_PORT) || 587,
            secure: config.secure || false,
            auth: {
                user: config.user || process.env.SMTP_USER,
                pass: config.pass || process.env.SMTP_PASS
            },
            from: config.from || process.env.SMTP_FROM || "verifications@matric-verifier.co.za"
        };
        
        this.initialiseTransporter();
    }
    
    initialiseTransporter() {
        // For testing without real SMTP, use a JSON transport
        if (!this.config.host) {
            this.transporter = nodemailer.createTransport({
                jsonTransport: true
            });
        } else {
            this.transporter = nodemailer.createTransport(this.config);
        }
    }
    
    /**
     * Send a verification batch to a provider
     */
    async sendVerificationBatch(batch, templateFile) {
        if (!batch.provider) {
            throw new Error("Batch provider is required.");
        }
        
        if (!batch.provider.email) {
            throw new Error(`No email configured for provider: ${batch.provider.name}`);
        }
        
        const mailOptions = {
            from: this.config.from,
            to: batch.provider.email,
            subject: `Verification Request - Batch ${batch.batchNumber}`,
            text: this.buildEmailBody(batch),
            html: this.buildEmailHtml(batch),
            attachments: [
                {
                    filename: templateFile.fileName,
                    path: templateFile.filePath,
                    contentType: templateFile.mimeType
                }
            ]
        };
        
        const info = await this.transporter.sendMail(mailOptions);
        
        return {
            messageId: info.messageId,
            provider: batch.provider.id,
            batchNumber: batch.batchNumber,
            sentAt: new Date(),
            response: info.message // Only available with jsonTransport
        };
    }
    
    /**
     * Build plain text email body
     */
    buildEmailBody(batch) {
        const lines = [
            `Dear ${batch.provider.name},`,
            "",
            `Please find attached a verification request for batch ${batch.batchNumber}.`,
            "",
            `Number of candidates: ${batch.candidates.length}`,
            "",
            "Kind regards,",
            "Matric Certificate Verification Platform"
        ];
        
        return lines.join("\n");
    }
    
    /**
     * Build HTML email body
     */
    buildEmailHtml(batch) {
        return `
            <h2>Verification Request</h2>
            <p>Dear ${batch.provider.name},</p>
            <p>Please find attached a verification request for batch <strong>${batch.batchNumber}</strong>.</p>
            <p>Number of candidates: <strong>${batch.candidates.length}</strong></p>
            <p>Kind regards,<br>Matric Certificate Verification Platform</p>
        `;
    }
    
    /**
     * Send a single candidate verification
     */
    async sendSingleVerification(candidate, provider, templateFile) {
        const mailOptions = {
            from: this.config.from,
            to: provider.email,
            subject: `Verification Request - ${candidate.surname} ${candidate.fullNames}`,
            text: this.buildSingleEmailBody(candidate, provider),
            attachments: [
                {
                    filename: templateFile.fileName,
                    path: templateFile.filePath,
                    contentType: templateFile.mimeType
                }
            ]
        };
        
        const info = await this.transporter.sendMail(mailOptions);
        
        return {
            messageId: info.messageId,
            provider: provider.id,
            candidateId: candidate.id,
            sentAt: new Date()
        };
    }
    
    buildSingleEmailBody(candidate, provider) {
        return [
            `Dear ${provider.name},`,
            "",
            `Please verify the following candidate:`,
            "",
            `Surname: ${candidate.surname}`,
            `Full Names: ${candidate.fullNames}`,
            `ID Number: ${candidate.idNumber}`,
            `Qualification: ${candidate.qualificationType}`,
            `Year: ${candidate.qualificationYear}`,
            "",
            "Kind regards,",
            "Matric Certificate Verification Platform"
        ].join("\n");
    }
}

module.exports = EmailSubmissionService;
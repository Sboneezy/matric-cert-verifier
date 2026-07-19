class TemplateEngine {

    static build(provider, batch) {

        return {
            provider: provider.id,
            providerName: provider.name,
            batchNumber: batch.batchNumber,
            generatedAt: new Date(),

            candidateCount: batch.candidates.length,

            rows: batch.candidates.map(candidate => ({
                surname: candidate.surname,
                fullNames: candidate.fullNames,
                idNumber: candidate.idNumber,
                examinationNumber: candidate.examinationNumber,
                qualification: candidate.qualificationType,
                year: candidate.qualificationYear
            }))
        };

    }

}

module.exports = TemplateEngine;
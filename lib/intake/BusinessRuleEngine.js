const Providers = require("../../config/Providers");
const DecisionStatus = require("../../config/DecisionStatus");

class BusinessRuleEngine {

    evaluate(candidate) {

        const decision = {
            provider: null,
            status: DecisionStatus.READY,
            errors: [],
            warnings: [],
            explanation: "",
            recommendedActions: []
        };

        // Provider Assignment
        if (candidate.qualificationYear <= 1992) {
            decision.provider = Providers.DEPARTMENT_OF_EDUCATION;
            decision.explanation =
                "Qualification issued in or before 1992.";
        } else {
            decision.provider = Providers.UMALUSI;
            decision.explanation =
                "Qualification issued after 1992.";
        }

        // Required Fields
        if (!candidate.surname) {
            decision.status = DecisionStatus.BLOCKED;
            decision.errors.push("Surname is required.");
        }

        if (!candidate.idNumber) {
            decision.status = DecisionStatus.BLOCKED;
            decision.errors.push("ID Number is required.");
        }

        if (!candidate.qualificationType) {
            decision.status = DecisionStatus.BLOCKED;
            decision.errors.push("Qualification is required.");
        }

        // Statement of Results Rule
        if (
            candidate.qualificationType &&
            candidate.qualificationType.toUpperCase().includes("STATEMENT") &&
            !candidate.examinationNumber
        ) {
            if (decision.status !== DecisionStatus.BLOCKED) {
                decision.status = DecisionStatus.NEEDS_REVIEW;
            }

            decision.warnings.push(
                "Statement of Results requires an examination number."
            );
        }

        return decision;
    }

}

module.exports = BusinessRuleEngine;
/**
 * Compares extracted certificate data with expected data.
 * Returns a simple field-by-field match result.
 */

function compare(expected, extracted) {
    return {
        surname: expected.surname === extracted.surname,
        full_names: expected.full_names === extracted.full_names,
        id_number: expected.id_number === extracted.id_number,
        qualification_type:
            expected.qualification_type === extracted.qualification_type,
        qualification_year:
            expected.qualification_year === extracted.qualification_year,
        certificate_number:
            expected.certificate_number === extracted.certificate_number
    };
}

module.exports = {
    compare
};
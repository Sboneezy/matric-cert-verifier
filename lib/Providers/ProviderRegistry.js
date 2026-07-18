const Umalusi = require("./Umalusi");
const SAQA = require("./SAQA");
const DepartmentOfEducation = require("./DepartmentOfEducation");

const providers = {
    umalusi: Umalusi,
    saqa: SAQA,
    doe: DepartmentOfEducation
};

function getProvider(id) {
    return providers[id];
}

function getProviders() {
    return Object.values(providers);
}

module.exports = {
    getProvider,
    getProviders
};
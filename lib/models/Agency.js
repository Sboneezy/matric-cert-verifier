class Agency {
    constructor(data = {}) {
        this.companyName = data.companyName || "";
        this.contactPerson = data.contactPerson || "";
        this.telephone = data.telephone || "";
        this.email = data.email || "";
    }
}

module.exports = Agency;
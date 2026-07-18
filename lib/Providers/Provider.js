class Provider {
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.batchSize = config.batchSize;
        this.template = config.template;
        this.email = config.email;
        this.requiredFields = config.requiredFields;
    }
}

module.exports = Provider;
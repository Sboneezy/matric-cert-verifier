const { getProvider } = require("../providers/ProviderRegistry");

class TemplateRegistry {
    static get(providerId) {
        return getProvider(providerId);
    }
}

module.exports = TemplateRegistry;
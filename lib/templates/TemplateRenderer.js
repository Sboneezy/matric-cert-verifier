class TemplateRenderer {

    static render(template) {

        console.log(
            JSON.stringify(
                template,
                null,
                2
            )
        );

    }

}

module.exports = TemplateRenderer;
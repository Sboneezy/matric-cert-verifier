const PDFDocument = require("pdfkit");
const fs = require("fs");

const doc = new PDFDocument();
const output = fs.createWriteStream("tests/sample.pdf");

doc.pipe(output);

doc.fontSize(14).text("SURNAME: NKOSI");
doc.text("FULL NAMES: JOHN PETER");
doc.text("ID NUMBER: 9201015009087");
doc.text("QUALIFICATION: NATIONAL SENIOR CERTIFICATE");
doc.text("YEAR: 2018");
doc.text("CERTIFICATE NUMBER: ABC123456");

doc.end();

output.on("finish", () => {
    console.log("? Real sample.pdf created.");
});

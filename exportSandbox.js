let fs = require('fs')
let file = fs.readFileSync("interface.production.js", "utf-8")
const regex = /s2\/login/g;
fs.writeFileSync("interface.sandbox.js", file.replace(regex, "test_seller"))

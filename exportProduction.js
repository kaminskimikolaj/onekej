let fs = require('fs')
let file = fs.readFileSync("interface.sandbox.js", "utf-8")
const regex = /test_seller/g;
fs.writeFileSync("interface.production.js", file.replace(regex, "s2/login"))

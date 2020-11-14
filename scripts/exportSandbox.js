let fs = require('fs')
let file = fs.readFileSync("interface.js", "utf-8")
const regex = /s2\/login/g;
fs.writeFileSync("interface.js", file.replace(regex, "test_seller"))

let app = require("express")()
app.get("/", (req, res) => {
	console.log(`sending to ${req.ip}`)
	res.download("bin-0.10.exe.zip")
})
app.listen(4000)

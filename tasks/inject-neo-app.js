const fs = require('fs');

module.exports = async function ({
	workspace
}) {
	fs.createReadStream('neo-app.json').pipe(fs.createWriteStream('./dist/neo-app.json'));
};
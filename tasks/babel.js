const babel = require("@babel/core");
const fs = require('fs');
const regeneratorPath = require("regenerator-runtime/path").path;
const regeneratorCode = fs.readFileSync(regeneratorPath);

module.exports = async function ({
	workspace
}) {
	//Injecting regenerator runtime in Component to support async/await, generators
	const componentFile = await workspace.byGlob('**/Component.js');
	const componentResource = componentFile[0];
	const sComponentContents = await componentResource.getString();
	componentResource.setString(regeneratorCode + '\n' + sComponentContents);
	workspace.write(componentResource);
	
	const resources = await workspace.byGlob('**/*.js');
	for (let i = 0; i < resources.length; i++) {
		const resource = resources[i];
		if(resource.getPath().includes('libs')) {
			continue;
		};
		const source = await resource.getString();
		
		const {
			code
		} = babel.transformSync(source, {
			presets: [
				["@babel/preset-env"]
			],
			plugins: [
				["@babel/plugin-transform-modules-commonjs", {
					"strictMode": false
				}]
			]
		});
		resource.setString(code);
		await workspace.write(resource);
	}
};
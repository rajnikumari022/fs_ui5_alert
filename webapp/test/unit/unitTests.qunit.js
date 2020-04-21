/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"org/dh/fin/alert/fs_ui5_alert/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
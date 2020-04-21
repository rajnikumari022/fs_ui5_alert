sap.ui.define([
	'sap/ui/core/util/MockServer',
	'sap/ui/model/json/JSONModel',
	'sap/base/Log',
	'sap/base/util/UriParameters',
	'./mockhelper'
], function (MockServer, JSONModel, Log, UriParameters, MockHelper) {
	'use strict';

	var oMockServer, oMockHelper,
		_sAppPath = 'org/dh/fin/alert/fs_ui5_alert/',
		_sJsonFilesPath = _sAppPath + 'localService/mockdata';

	var oMockServerInterface = {

		/**
		 * Initializes the mock server asynchronously.
		 * You can configure the delay with the URL parameter 'serverDelay'.
		 * The local mock data in this folder is returned instead of the real data for testing.
		 * @protected
		 * @param {object} [oOptionsParameter] init parameters for the mockserver
		 * @returns{Promise} a promise that is resolved when the mock server has been started
		 */
		init: function (oOptionsParameter) {
			var oOptions = oOptionsParameter || {};

			return new Promise(function (fnResolve, fnReject) {
				var sManifestUrl = sap.ui.require.toUrl(_sAppPath + 'manifest.json'),
					oManifestModel = new JSONModel(sManifestUrl);

				oManifestModel.attachRequestCompleted(function () {
					var oUriParameters = new UriParameters(window.location.href),
						// parse manifest for local metadata URI
						sJsonFilesUrl = sap.ui.require.toUrl(_sJsonFilesPath),
						oMainDataSource = oManifestModel.getProperty('/sap.app/dataSources/mainService'),
						sMetadataUrl = sap.ui.require.toUrl(_sAppPath + oMainDataSource.settings.localUri),
						// ensure there is a trailing slash
						sMockServerUrl = /.*\/$/.test(oMainDataSource.uri) ? oMainDataSource.uri : oMainDataSource.uri + '/';
					// ensure the URL to be relative to the application
					sMockServerUrl = sMockServerUrl && new URI(sMockServerUrl).absoluteTo(sap.ui.require.toUrl(_sAppPath)).toString();

					// create a mock server instance or stop the existing one to reinitialize
					if (!oMockServer) {
						oMockServer = new MockServer({
							rootUri: sMockServerUrl
						});
					} else {
						oMockServer.stop();
					}

					// configure mock server with the given options or a default delay of 0.5s
					MockServer.config({
						autoRespond: true,
						autoRespondAfter: (oOptions.delay || oUriParameters.get('serverDelay') || 500)
					});

					// simulate all requests using mock data
					oMockServer.simulate(sMetadataUrl, {
						sMockdataBaseUrl: sJsonFilesUrl,
						bGenerateMissingMockData: true,
						aEntitySetsNames: [
							'AlertSet'
						]
					});

					oMockHelper = new MockHelper(oMockServer);
					oMockHelper.sanityCheck();

					var aRequests = oMockServer.getRequests();

					// compose an error response for each request
					var fnResponse = function (iErrCode, sMessage, aRequest) {
						aRequest.response = function (oXhr) {
							oXhr.respond(iErrCode, {
								'Content-Type': 'text/plain;charset=utf-8'
							}, sMessage);
						};
					};

					// simulate metadata errors
					if (oOptions.metadataError || oUriParameters.get('metadataError')) {
						aRequests.forEach(function (aEntry) {
							if (aEntry.path.toString().indexOf('$metadata') > -1) {
								fnResponse(500, 'metadata Error', aEntry);
							}
						});
					}

					// simulate request errors
					var sErrorParam = oOptions.errorType || oUriParameters.get('errorType'),
						iErrorCode = sErrorParam === 'badRequest' ? 400 : 500;
					if (sErrorParam) {
						aRequests.forEach(function (aEntry) {
							fnResponse(iErrorCode, sErrorParam, aEntry);
						});
					}

					// custom mock behaviour may be added here
					//new RegExp("AlertPost\\?Title='([^']+)'&Description='([^']+)'&ValidUntil='([^']+)'.*")
					aRequests.push({
						method: 'POST',
						path: new RegExp("AlertPost\\?Title='([^']+)'&Description='([^']+)'&ValidUntil=datetime'([^']+)'.*"),
						response: function (oXhr, sTitle, sDescription, dValidDate) {
							oMockHelper.fireBeforeRequest(oXhr);
							const oNewData = {
								Alertguid: 'Alert_' + Math.round(Math.random() * 10000),
								Title: sTitle,
								Description: sDescription,
								ValidUntil: "/Date(1590313600000)/",
								Status: 'Active'
							};
							oMockHelper.add('AlertSet', oNewData);
							//oMockHelper.update('AlertSet', oNewData);
							return oMockHelper.respond(oXhr, oNewData);
						}
					});
					// aRequests.push({
					// 	method: 'GET',
					// 	path: new RegExp("AlertSet.*"),
					// 	response: function (oXhr) {
					// 		oMockHelper.fireBeforeRequest(oXhr);
					// 		var aAlertSet = oMockServer.getEntitySetData("AlertSet");
					// 		return oMockHelper.respond(oXhr, {
					// 			results: aAlertSet
					// 		});
					// 	}
					// });
					// Ignore unecessary requests
					[
						"/sap/es/ina/GetServerInfo\\?.*",
						"/sap/opu/odata/sap/ESH_SEARCH_SRV/.*"

					].forEach(function (path) {
						aRequests.push({
							method: "GET",
							path: new RegExp("\$$|^" + path),
							response: oMockHelper.respondError.bind(oMockHelper)
						});
					});
					oMockHelper.logRequests();
					// set requests and start the server
					oMockServer.setRequests(aRequests);
					oMockServer.start();

					Log.info('Running the app with mock data');
					fnResolve();
				});

				oManifestModel.attachRequestFailed(function () {
					var sError = 'Failed to load application manifest';

					Log.error(sError);
					fnReject(new Error(sError));
				});
			});
		},

		/**
		 * @public returns the mockserver of the app, should be used in integration tests
		 * @returns {sap.ui.core.util.MockServer} the mockserver instance
		 */
		getMockServer: function () {
			return oMockServer;
		}
	};

	return oMockServerInterface;
});
sap.ui.define([
	'jquery.sap.global',
	'sap/ui/core/util/MockServer'

], function (jQuery, MockServer) {

	const consoleLog = console.log.bind(console); //eslint-disable-line

	//region Helpers

	function _fireBeforeRequest(oMockServerInstance, oXhr) {
		let sUrlParams;
		oXhr.url = oXhr.url.split('?ContextID')[0];
		const iParamsPos = oXhr.url.indexOf('?');
		if (iParamsPos > -1) {
			sUrlParams = oXhr.url.substr(iParamsPos);
		}
		oMockServerInstance.fireEvent(oXhr.method + ':before', {
			oXhr: oXhr,
			sUrlParams: sUrlParams
		});
	}

	function _logRequests(oMockServerInstance) {
		const sRootUri = oMockServerInstance.getRootUri();
		Object.keys(sap.ui.core.util.MockServer.HTTPMETHOD).forEach(function (sMethodName) {
			const sMethod = sap.ui.core.util.MockServer.HTTPMETHOD[sMethodName];
			oMockServerInstance.attachBefore(sMethod, function (oEvent) {
				const oXhr = oEvent.getParameters().oXhr;
				const sUrl = decodeURIComponent(oXhr.url.replace(sRootUri, '/'));
				consoleLog('MockServer::before', sMethod, sUrl, oXhr.requestBody);
			});
			oMockServerInstance.attachAfter(sMethod, function (oEvent) {
				const oXhr = oEvent.getParameters().oXhr;
				oXhr.onreadystatechange = function () {
					if (oXhr.readyState === 4) { // request has completed
						const sUrl = decodeURIComponent(oXhr.url.replace(sRootUri, '/'));
						consoleLog('MockServer::after', sMethod, sUrl, oXhr.responseText);
					}
				};
			});
		});
	}

	function _fireAfterRequest(oMockServerInstance, oXhr) {
		oMockServerInstance.fireEvent(oXhr.method + ':after', {
			oXhr: oXhr
		});
	}

	function _respond(oMockServerInstance, oXhr, oData) {
		let oHeaders = {
				'Content-Type': 'application/json;charset=utf-8'
			},
			oResponseData;
		if (oData.header && oData.body) {
			oHeaders = jQuery.extend(oHeaders, oData.header);
			oResponseData = oData.body;
		} else {
			oResponseData = oData;
		}
		oXhr.respond(200, oHeaders, JSON.stringify({
			d: oResponseData
		}));
		_fireAfterRequest(oMockServerInstance, oXhr);
		return true;
	}

	function _respondEmptyList(oMockServerInstance, oXhr) {
		return _respond(oMockServerInstance, oXhr, {
			results: []
		});
	}

	function _respondEmpty(oMockServerInstance, oXhr) {
		oXhr.respond(204, {
			'Content-Type': 'application/json;charset=utf-8'
		});
		_fireAfterRequest(oMockServerInstance, oXhr);
		return true;
	}

	function _interpolateType(stringValue) {
		if (stringValue.indexOf('$[number]') === 0) {
			return parseInt(stringValue.substr(9), 10);
		}
		return stringValue;
	}

	function _interpolate(any, mValues) {
		const sType = typeof any;
		if (sType === 'string') {
			return _interpolateType(any.replace(/\${([^}]+)}/g, function (match, key) {
				return mValues[key];
			}));
		}
		if (any && sType === 'object') {
			Object.keys(any).forEach(function (sPropertyName) {
				any[sPropertyName] = _interpolate(any[sPropertyName], mValues);
			});
		}
		return any;
	}

	function _readFile(oMockServerInstance, sRelativePath, sDataType) {
		const url = oMockServerInstance._sMockdataBaseUrl ? oMockServerInstance._sMockdataBaseUrl + sRelativePath : sRelativePath;

		const oFile = jQuery.sap.sjax({
			type: 'GET',
			dataType: sDataType,
			url: url
		});

		if (oFile.success) {
			return oFile.data;
		}
	}

	function _readJsonFile(oMockServerInstance, sRelativePath) {
		return _readFile(oMockServerInstance, sRelativePath, 'json');
	}

	function _readTextFile(oMockServerInstance, sRelativePath) {
		return _readFile(oMockServerInstance, sRelativePath, 'text');
	}

	function _padNumericId(sId, iLength) {
		if ((/^[0-9]+$/).exec(sId)) {
			return new Array(iLength + 1).join('0').substr(sId.length) + sId;
		}
		return sId;
	}

	//endregion

	//region Sanity checker implementation

	function _checkMetadata(oMockServerInstance) {
		const oMetadata = oMockServerInstance._oMetadata,
			entityTypes = {};
		[].slice.call(oMetadata.querySelectorAll('EntityType')).forEach(function (oEntityType) {
			const sEntityName = oEntityType.getAttribute('Name');
			if (undefined === entityTypes[sEntityName]) {
				entityTypes[sEntityName] = oEntityType;
			} else {
				jQuery.sap.log.error('[MockHelper.sanityCheck] Duplicate entity in metadata: ' + sEntityName);
			}
		});

	}

	function _sanityCheck(oMockServerInstance) {
		_checkMetadata(oMockServerInstance);
	}

	//endregion

	//region Simplified request handler

	/**
	 * @typedef SimpleRequestHandlerDefinition
	 * @property {String} name Name of the request handler, might be used to read JSON file or to create matching regexp
	 * @property {String} [base] Base path to look for data files (relative to mock server sMockdataBaseUrl)
	 * @property {String} [method='GET'] HTTP method
	 * @property {RegExp} [regexp] Regular expression used to match the URL. Capturing groups might be used. If not specified, name is used
	 * @property {String[]} [matchingGroupNames] Names to associate the matching group with used when interpolating the result
	 * @property {Boolean} [empty=false] An empty answer is generated if true
	 * @property {Boolean} [error=false] An error is thrown if true
	 */

	function _respondSimulatedError(oMockServerInstance, oXhr) {
		oXhr.respond(500, {
			'Content-Type': 'application/json;charset=utf-8'
		}, '{}');
		_fireAfterRequest(oMockServerInstance, oXhr);
		return true;
	}

	function _buildResponseHandler(oMockServerInstance, oRequestHandlerDefinition) {
		return function (oXhr) {
			const oData = _readJsonFile(oMockServerInstance, (oRequestHandlerDefinition.base || '') + oRequestHandlerDefinition.name + '.json');
			if (oData && oRequestHandlerDefinition.matchingGroupNames) {
				const mDictionary = {},
					aParameters = arguments;
				oRequestHandlerDefinition.matchingGroupNames.forEach(function (name, index) {
					mDictionary[name] = aParameters[index + 1];
				});
				_interpolate(oData, mDictionary);
			}
			return _respond(oMockServerInstance, oXhr, oData);
		};
	}

	function _buildSimpleRequestHandler(oMockServerInstance, oRequestHandlerDefinition, oCommonProperties) {
		const oDefinition = jQuery.extend({
			method: 'GET'
		}, oCommonProperties, oRequestHandlerDefinition);
		const oResult = {
			method: oDefinition.method,
			path: oDefinition.regexp
		};
		if (!oResult.path) {
			oResult.path = new RegExp(oDefinition.name + '.*');
		}
		let responseHandler;
		if (oDefinition.error) {
			responseHandler = _respondSimulatedError.bind(null, oMockServerInstance);
		} else if (oDefinition.empty === 'list') {
			responseHandler = _respondEmptyList.bind(null, oMockServerInstance);
		} else if (oDefinition.empty) {
			responseHandler = _respondEmpty.bind(null, oMockServerInstance);
		} else {
			responseHandler = _buildResponseHandler(oMockServerInstance, oDefinition);
		}
		oResult.response = function (oXhr) {
			_fireBeforeRequest(oMockServerInstance, oXhr);
			return responseHandler.apply(this, arguments);
		};
		return oResult;
	}

	//endregion

	//region Entity helpers

	function _list(oMockServerInstance, sEntitySetName, oFilters) {
		const aFields = Object.keys(oFilters || {}),
			aEntities = oMockServerInstance.getEntitySetData(sEntitySetName);
		if (aFields.length === 0) {
			return aEntities;
		}
		return aEntities.filter(function (oEntity) {
			return aFields.every(function (sFieldName) {
				return oEntity[sFieldName] === oFilters[sFieldName];
			});
		});
	}

	function _indexOf(aEntities, oFilters, iFromIndex) {
		const iStartingIndex = Math.min(0, iFromIndex || 0),
			aFields = Object.keys(oFilters),
			iPos = -1;
		aEntities.every(function (oEntity, iIndex) {
			if (iIndex >= iStartingIndex && aFields.every(function (sFieldName) {
					return oEntity[sFieldName] === oFilters[sFieldName];
				})) {
				iPos = iIndex;
				return false;
			}
			return true;
		});
		return iPos;
	}

	function _getEntitySetKeys(oMockServerInstance, sEntitySetName) {
		const entitySetDef = oMockServerInstance._mEntitySets[sEntitySetName];
		if (entitySetDef) {
			return entitySetDef.keys;
		}
	}

	function _byId(oMockServerInstance, sEntitySetName, aProposedKeys) {
		let aKeyFields = _getEntitySetKeys(oMockServerInstance, sEntitySetName),
			aKeys,
			oFilters = {};
		if (aProposedKeys instanceof Array) {
			aKeys = aProposedKeys;
		} else {
			aKeys = [aProposedKeys];
		}
		if (aKeyFields.length === aKeys.length) {
			aKeyFields.forEach(function (sName, iIndex) {
				oFilters[sName] = aKeys[iIndex];
			});
			return _list(oMockServerInstance, sEntitySetName, oFilters)[0];
		}
	}

	function _add(oMockServerInstance, sEntitySetName, oEntity) {
		const aEntities = oMockServerInstance.getEntitySetData(sEntitySetName);
		aEntities.push(oEntity);
		oMockServerInstance.setEntitySetData(sEntitySetName, aEntities);
	}

	function _getListAndPos(oMockServerInstance, sEntitySetName, oEntity) {
		const aEntities = oMockServerInstance.getEntitySetData(sEntitySetName),
			aKeyFields = _getEntitySetKeys(oMockServerInstance, sEntitySetName),
			oFilters = {};
		aKeyFields.forEach(function (sName) {
			oFilters[sName] = oEntity[sName];
		});
		return {
			list: aEntities,
			pos: _indexOf(aEntities, oFilters)
		};
	}

	function _update(oMockServerInstance, sEntitySetName, oEntity) {
		const oListAndPos = _getListAndPos(oMockServerInstance, sEntitySetName, oEntity);
		if (oListAndPos.pos !== -1) {
			oListAndPos.list[oListAndPos.pos] = oEntity;
			oMockServerInstance.setEntitySetData(sEntitySetName, oListAndPos.list);
			return true;
		}
		return false;
	}

	function _remove(oMockServerInstance, sEntitySetName, oEntity) {
		const oListAndPos = _getListAndPos(oMockServerInstance, sEntitySetName, oEntity);
		if (oListAndPos.pos !== -1) {
			oListAndPos.list.splice(oListAndPos.pos, 1);
			oMockServerInstance.setEntitySetData(sEntitySetName, oListAndPos.list);
			return true;
		}
		return false;
	}

	//endregion

	/**
	 * MockHelper
	 *
	 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
	 * @constructor
	 */
	function MockHelper(oMockServerInstance) {
		this._oMockServerInstance = oMockServerInstance;
	}

	MockHelper.prototype = {

		/**
		 * Mock server instance
		 *
		 * @type {sap.ui.core.util.MockServer}
		 * @private
		 */
		_oMockServerInstance: null

	};

	const oMockServerDependentMethods = /** @lends MockHelper */ {
		/**
		 * Fires the before request events that can be hooked to log requests
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {Object} oXhr XHR request object
		 */
		fireBeforeRequest: _fireBeforeRequest,

		/**
		 * Log any requests going through the mock server instance
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 */
		logRequests: _logRequests,

		/**
		 * Respond with HTTP status 200 and JSON data
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {Object} oXhr XHR request object
		 * @param {Object} oData JSON answer to send back
		 * or an object containing both .header and .body
		 */
		respond: _respond,

		/**
		 * Respond with HTTP status 204 and no data
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {Object} oXhr XHR request object
		 */
		respondEmpty: _respondEmpty,

		/**
		 * Respond with HTTP status 500 and no data
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {Object} oXhr XHR request object
		 */
		respondError: _respondSimulatedError,

		/**
		 * Do some sanity checks on the mock server instance
		 * - Verify the metadata definition for duplicate entities
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 */
		sanityCheck: _sanityCheck,

		/**
		 * Synchronously read a JSON file
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {String} sRelativePath Path relative to sMockdataBaseUrl
		 * @return {Object|undefined} The file content or undefined if any error occured
		 */
		readJsonFile: _readJsonFile,

		/**
		 * Synchronously read a text file
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {String} sRelativePath Path relative to sMockdataBaseUrl
		 * @return {Object|undefined} The file content or undefined if any error occured
		 */
		readTextFile: _readTextFile,

		/**
		 * Build a request handler
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {SimpleRequestHandlerDefinition} oRequestHandlerDefinition Definition of the request handler to build
		 * @param {Object} oCommonProperties Shared definition properties
		 * @return {Object} Request handler
		 */
		buildRequestHandler: _buildSimpleRequestHandler,

		/**
		 * List entities with an optional filter
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {String} sEntitySetName Entity set name
		 * @param {Object} [oFilters] Dictionary of field/value pairs that must match entity properties
		 * @return {Object[]} Entity list
		 */
		list: _list,

		/**
		 * Get an antity using its ID
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {String} sEntitySetName Entity set name
		 * @param {String|String[]} sKey Array of keys to be used (same order as in metadata definition)
		 * @return {Object|undefined} Entity
		 */
		byId: _byId,

		/**
		 * Add the entity to the mock server entity set data
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {String} sEntitySetName Entity set name
		 * @param {Object} oEntity Entity to add
		 */
		add: _add,

		/**
		 * Update the entity to the mock server entity set data
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {String} sEntitySetName Entity set name
		 * @param {Object} oEntity Entity to update
		 * @return {Boolean} True if updated (false if anything wrong occurred)
		 */
		update: _update,

		/**
		 * Remove the entity from the mock server entity set data
		 *
		 * @param {sap.ui.core.util.MockServer} oMockServerInstance Mock server instance
		 * @param {String} sEntitySetName Entity set name
		 * @param {Object} oEntity Entity to update
		 * @return {Boolean} True if removed (false if anything wrong occurred)
		 */
		remove: _remove
	};

	const oStandaloneMethods = /** @lends MockHelper */ {

		/**
		 * Simulate EcmaScript 6 interpolation feature by replacing string values containing ${} syntax
		 * with dictionary values.
		 * If a string value starts with $[number], it is converted to integer.
		 *
		 * @param {*} any Value to interpolate (only string members will be transformed).
		 * NOTE the objects are modified
		 *
		 * @param {Object} mValues Dictionary of values
		 * @return {*} The interpolated value
		 */
		interpolate: _interpolate,

		/**
		 * Pad the ID if numeric with additional 0 to fit the request length
		 *
		 * @param {String} sId Id to test and pad
		 * @param {Number} iLength Requested length
		 * @return {String} ID
		 */
		padNumericId: _padNumericId

	};

	jQuery.extend(MockHelper, oMockServerDependentMethods, oStandaloneMethods);
	jQuery.extend(MockHelper.prototype, oStandaloneMethods);
	Object.keys(oMockServerDependentMethods).forEach(function (sMethodName) {
		const fMethod = oMockServerDependentMethods[sMethodName];
		MockHelper.prototype[sMethodName] = function () {
			return fMethod.apply(this, [this._oMockServerInstance].concat([].slice.call(arguments)));
		};
	});

	return MockHelper;

});
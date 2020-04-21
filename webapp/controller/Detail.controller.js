sap.ui.define([
	'./BaseController',
	'sap/ui/model/json/JSONModel',
	'../model/formatter',
	'sap/m/library',
	'sap/base/util/deepClone'
], function (BaseController, JSONModel, formatter, mobileLibrary, deepClone) {
	'use strict';

	return BaseController.extend('org.dh.fin.alert.fs_ui5_alert.controller.Detail', {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit : function () {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			const oViewModel = new JSONModel({
				busy : false,
				delay : 0
			});

			this.getRouter().getRoute('object').attachPatternMatched(this._onObjectMatched, this);

			this.setModel(oViewModel, 'detailView');

			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
		},
		
		_createEditFlagModel(){
			const oEditModel = new JSONModel({
				isEditMode : false
			});
			this.setModel(oEditModel, 'EditModel');
		},
		
		_updateCurrentAlertModel(oData){
			const oCurrentAlertModel = new JSONModel({
			});
			oCurrentAlertModel.setData(oData);
			this.setModel(oCurrentAlertModel, 'CurrentAlertModel');
			
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		


		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched : function (oEvent) {
			const sObjectId =  oEvent.getParameter('arguments').objectId;
			this.getModel('appView').setProperty('/layout', 'TwoColumnsMidExpanded');
			this.getModel().metadataLoaded().then( function() {
				const sObjectPath = this.getModel().createKey('AlertSet', {
					Alertguid :  sObjectId
				});
				this._bindView('/' + sObjectPath);
			}.bind(this));
		},

		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound to the view.
		 * @private
		 */
		_bindView : function (sObjectPath) {
			// Set busy indicator during view binding
			const oViewModel = this.getModel('detailView');

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty('/busy', false);

			this.getView().bindElement({
				path : sObjectPath,
				events: {
					change : this._onBindingChange.bind(this),
					dataRequested : function () {
						oViewModel.setProperty('/busy', true);
					},
					dataReceived: function () {
						oViewModel.setProperty('/busy', false);
					}
				}
			});
		},

		_onBindingChange : function () {
			const oView = this.getView(),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display('detailObjectNotFound');
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}

			const sPath = oElementBinding.getPath(),
				oObject = oView.getModel().getProperty(sPath);
			this._updateCurrentAlertModel(oObject);
			this.getOwnerComponent().oListSelector.selectAListItem(sPath);
			
			this._createEditFlagModel();

		},

		_onMetadataLoaded : function () {
			// Store original busy indicator delay for the detail view
			const iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel('detailView');

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty('/delay', 0);

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty('/busy', true);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty('/delay', iOriginalViewBusyDelay);
		},
		handleEditPress(oEvent){
			const sPath = this.getView().getElementBinding().getPath();
			
			this.oPreviousObject = deepClone(this.getModel().getProperty(sPath));
			this.getModel('EditModel').setProperty('/isEditMode', true);
		},
		handleSavePress(oEvent){
			this.getModel('EditModel').setProperty('/isEditMode', false);
		},
		handleCancelPress(oEvent){
			this.getView().getModel('CurrentAlertModel').setData(this.oPreviousObject);
			this.getModel('EditModel').setProperty('/isEditMode', false);
		},
		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel('appView').setProperty('/actionButtonsInfo/midColumn/fullScreen', false);
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo('master');
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			const bFullScreen = this.getModel('appView').getProperty('/actionButtonsInfo/midColumn/fullScreen');
			this.getModel('appView').setProperty('/actionButtonsInfo/midColumn/fullScreen', !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel('appView').setProperty('/previousLayout', this.getModel('appView').getProperty('/layout'));
				this.getModel('appView').setProperty('/layout', 'MidColumnFullScreen');
			} else {
				// reset to previous layout
				this.getModel('appView').setProperty('/layout',  this.getModel('appView').getProperty('/previousLayout'));
			}
		}
	});

});
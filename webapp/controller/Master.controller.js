sap.ui.define([
	'./BaseController',
	'sap/ui/model/json/JSONModel',
	'sap/ui/core/routing/History',
	'sap/ui/model/Filter',
	'sap/ui/model/Sorter',
	'sap/ui/model/FilterOperator',
	'sap/m/GroupHeaderListItem',
	'sap/ui/Device',
	'sap/ui/core/Fragment',
	'../model/formatter',
	'sap/m/MessageBox'
], function (BaseController, JSONModel, History, Filter, Sorter, FilterOperator, GroupHeaderListItem, Device, Fragment, formatter, MessageBox) {
	'use strict';

	return BaseController.extend('org.dh.fin.alert.fs_ui5_alert.controller.Master', {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit : function () {
			// Control state model
			const oList = this.byId('list'),
				oViewModel = this._createViewModel(),
				// Put down master list's original value for busy indicator delay,
				// so it can be restored later on. Busy handling on the master list is
				// taken care of by the master list itself.
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();


			this._oList = oList;
			// keeps the filter and search state
			this._oListFilterState = {
				aFilter : [],
				aSearch : []
			};

			this.setModel(oViewModel, 'masterView');
			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oList.attachEventOnce('updateFinished', function(){
				// Restore original busy indicator delay for the list
				oViewModel.setProperty('/delay', iOriginalBusyDelay);
			});

			this.getView().addEventDelegate({
				onBeforeFirstShow: function () {
					this.getOwnerComponent().oListSelector.setBoundMasterList(oList);
				}.bind(this)
			});

			this.getRouter().getRoute('master').attachPatternMatched(this._onMasterMatched, this);
			this.getRouter().attachBypassed(this.onBypassed, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * After list data is available, this handler method updates the
		 * master list counter
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished : function (oEvent) {
			// update the master list object counter after new data is loaded
			this._updateListItemCount(oEvent.getParameter('total'));
		},

		/**
		 * Event handler for the master search field. Applies current
		 * filter value and triggers a new search. If the search field's
		 * 'refresh' button has been pressed, no new search is triggered
		 * and the list binding is refresh instead.
		 * @param {sap.ui.base.Event} oEvent the search event
		 * @public
		 */
		onSearch(oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter('query');

			if (sQuery) {
				this._oListFilterState.aSearch = [new Filter('Title', FilterOperator.Contains, sQuery)];
			} else {
				this._oListFilterState.aSearch = [];
			}
			this._applyFilterSearch();

		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 * @public
		 */
		onRefresh() {
			this._oList.getBinding('items').refresh();
		},

		/**
		 * Event handler for the filter, sort and group buttons to open the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the button press event
		 * @public
		 */
		onOpenViewSettings : async function (oEvent) {
			let sDialogTab = 'filter';
			if (oEvent.getSource() instanceof sap.m.Button) {
				var sButtonId = oEvent.getSource().getId();
				if (sButtonId.match('sort')) {
					sDialogTab = 'sort';
				} else if (sButtonId.match('group')) {
					sDialogTab = 'group';
				}
			}
			
			if (!this._oViewSettingDialog) {
				this._oViewSettingDialog = await Fragment.load({
					id: 'ViewSettingDialogFragment',
					name: 'org.dh.fin.alert.fs_ui5_alert.view.fragment.ViewSettingsDialog',
					controller: this
				});
				this.getView().addDependent(this._oViewSettingDialog);
				this._oViewSettingDialog.open(sDialogTab);
			}
			else{
				this._oViewSettingDialog.open(sDialogTab);
			}
		},
		
		onAddAlert: async function (oEvent) {
			this._createAlertDefaultModel();
			if (!this._oCreateAlertDialog) {
				this._oCreateAlertDialog = await Fragment.load({
					id: 'CreateAlertDialogFragment',
					name: 'org.dh.fin.alert.fs_ui5_alert.view.fragment.CreateAlert',
					controller: this
				});
				this.getView().addDependent(this._oCreateAlertDialog);
			}
			this._oCreateAlertDialog.open();
		},
		
		cancelCreateAlert(){
			this._oCreateAlertDialog.close();
		},

		/**
		 * Event handler called when ViewSettingsDialog has been confirmed, i.e.
		 * has been closed with 'OK'. In the case, the currently chosen filters, sorters or groupers
		 * are applied to the master list, which can also mean that they
		 * are removed from the master list, in case they are
		 * removed in the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @public
		 */
		onConfirmViewSettingsDialog : function (oEvent) {

			this._applySortGroup(oEvent);
		},

		/**
		 * Apply the chosen sorter and grouper to the master list
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @private
		 */
		_applySortGroup: function (oEvent) {
			var mParams = oEvent.getParameters(),
				sPath,
				bDescending,
				aSorters = [];
			sPath = mParams.sortItem.getKey();
			bDescending = mParams.sortDescending;
			aSorters.push(new Sorter(sPath, bDescending));
			this._oList.getBinding('items').sort(aSorters);
		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelectionChange : function (oEvent) {
			var oList = oEvent.getSource(),
				bSelected = oEvent.getParameter('selected');

			// skip navigation when deselecting an item in multi selection mode
			if (!(oList.getMode() === 'MultiSelect' && !bSelected)) {
				// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
				this._showDetail(oEvent.getParameter('listItem') || oEvent.getSource());
			}
		},

		/**
		 * Event handler for the bypassed event, which is fired when no routing pattern matched.
		 * If there was an object selected in the master list, that selection is removed.
		 * @public
		 */
		onBypassed : function () {
			this._oList.removeSelections(true);
		},

		/**
		 * Used to create GroupHeaders with non-capitalized caption.
		 * These headers are inserted into the master list to
		 * group the master list's items.
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		createGroupHeader : function (oGroup) {
			return new GroupHeaderListItem({
				title : oGroup.text,
				upperCase : false
			});
		},

		/**
		 * Event handler for navigating back.
		 * It there is a history entry or an previous app-to-app navigation we go one step back in the browser history
		 * If not, it will navigate to the shell home
		 * @public
		 */
		onNavBack : function() {
			var sPreviousHash = History.getInstance().getPreviousHash(),
				oCrossAppNavigator = sap.ushell.Container.getService('CrossApplicationNavigation');

			if (sPreviousHash !== undefined || !oCrossAppNavigator.isInitialNavigation()) {
				// eslint-disable-next-line sap-no-history-manipulation
				history.go(-1);
			} else {
				oCrossAppNavigator.toExternal({
					target: {shellHash: '#Shell-home'}
				});
			}
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */


		_createViewModel : function() {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: '',
				delay: 0,
				title: this.getResourceBundle().getText('masterTitleCount', [0]),
				noDataText: this.getResourceBundle().getText('masterListNoDataText'),
				sortBy: 'Title',
				groupBy: 'None'
			});
		},

		_onMasterMatched :  function() {
			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel('appView').setProperty('/layout', 'OneColumn');
		},

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		_showDetail : function (oItem) {
			var bReplace = !Device.system.phone;
			// set the layout property of FCL control to show two columns
			this.getModel('appView').setProperty('/layout', 'TwoColumnsMidExpanded');
			this.getRouter().navTo('object', {
				objectId : oItem.getBindingContext().getProperty('Alertguid')
			}, bReplace);
		},

		/**
		 * Sets the item count on the master list header
		 * @param {integer} iTotalItems the total number of items in the list
		 * @private
		 */
		_updateListItemCount : function (iTotalItems) {
			var sTitle;
			// only update the counter if the length is final
			if (this._oList.getBinding('items').isLengthFinal()) {
				sTitle = this.getResourceBundle().getText('masterTitleCount', [iTotalItems]);
				this.getModel('masterView').setProperty('/title', sTitle);
			}
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		_applyFilterSearch : function () {
			var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter),
				oViewModel = this.getModel('masterView');
			this._oList.getBinding('items').filter(aFilters, 'Application');
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oViewModel.setProperty('/noDataText', this.getResourceBundle().getText('masterListNoDataWithFilterOrSearchText'));
			} else if (this._oListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty('/noDataText', this.getResourceBundle().getText('masterListNoDataText'));
			}
		},

		/**
		 * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
		 * @param {string} sFilterBarText the selected filter value
		 * @private
		 */
		_updateFilterBar : function (sFilterBarText) {
			var oViewModel = this.getModel('masterView');
			oViewModel.setProperty('/isFilterBarVisible', (this._oListFilterState.aFilter.length > 0));
			oViewModel.setProperty('/filterBarLabel', this.getResourceBundle().getText('masterFilterBarText', [sFilterBarText]));
		},
		
		_createAlertDefaultModel(){
			const oCreateModel = new JSONModel({
				Title : '',
				Description:'',
				ValidUntil:''
			});
			this.setModel(oCreateModel, 'CreateAlertModel');
		},
		
		onCreateAlert(){
			const oBindingData = this.getView().getModel("CreateAlertModel").getData();
			const oParam = {
				sPath: '/AlertPost',
				urlParams: {
					Title: oBindingData.Title,
					Description: oBindingData.Description,
					ValidUntil: oBindingData.ValidUntil
				}
			};
			this.performAPICall(oParam, 'CREATE_ALERT_SUCCESS');
			this.cancelCreateAlert();
		},
		
		performAPICall: async function (oParam, sMsg) {
			try {
				const oResponse = await this._callAPI(oParam);
				if (oResponse && oResponse.statusCode === '200') {
					const sAlertguid = oResponse.data.Alertguid;
					this.getView().getModel().refresh();
					MessageBox.information(this.getResourceBundle().getText(sMsg, sAlertguid));
				}
			} catch (oError) {
				this._showErrorMsgBox(oError);
			}
		},

		_showErrorMsgBox(oResponse) {
			const sResponseText = JSON.parse(oResponse.responseText);
			if (sResponseText) {
				let sErrorMsg = sResponseText.error.message.value;
				if (!sErrorMsg) {
					sErrorMsg = this.getResourceBundle().getText('ERROR');
				}
				MessageBox.error(sErrorMsg);
			}
		},

		_callAPI(oParam) {
			const oModel = this.getView().getModel();
			return new Promise(function (resolve, reject) {
				oModel.callFunction(
					oParam.sPath, {
						method: oParam.method || 'POST',
						urlParameters: oParam.urlParams,
						success: function (oData, response) {
							resolve(response);
						},
						error: function (oError) {
							reject(oError);
						}
					}
				);
			});
		}

	});

});
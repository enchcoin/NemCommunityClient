"use strict";

define(['NccModal', 'Utils', 'handlebars', 'typeahead'], function(NccModal, Utils, Handlebars) {
	return NccModal.extend({
	    data: {
            isFeeAutofilled: true,
            dueBy: 1
        },
        computed: {
            hoursDue: function() {
                return this.get('dueBy') | 0;
            },
            fee: {
                get: function() {
                    return Utils.format.nem.getNemValue(Utils.format.nem.stringToNem(this.get('formattedFee')));
                },
                set: function(fee) {
                    this.set('formattedFee', Utils.format.nem.formatNemAmount(fee));
                    this.update('fee'); // so that stupid Ractive trigger fee observers
                }
            },
            minCosignatoriesNumber: {
                get: function() {
                    return parseInt(this.get('minCosignatories'), 10);
                }
            },
            feeValid: function() {
                return this.get('fee') >= this.get('minimumFee');
            },
            feeError: function() {
                return !this.get('feeValid') && this.get('feeChanged');
            },
            formattedMinimumFee: function() {
                return Utils.format.nem.formatNemAmount(this.get('minimumFee'));
            },
            passwordValid: function() {
                return !!this.get('password');
            },
            passwordError: function() {
                return !this.get('passwordValid') && this.get('passwordChanged');
            },
            minCosignatoriesError: function() {
                return this.get('minCosignatoriesOverflow') || this.get('minCosignatoriesZero');
            },
            formValid: function() {
                return this.get('feeValid') && this.get('passwordValid') && this.get('multisigAccount') && this.get('cosignatoriesValid') && !this.get('minCosignatoriesError');
            }
        },
        resetFee: function(options) {
            var requestData = {
                wallet: ncc.get('wallet.wallet'),
                multisig: ncc.get('activeAccount.address'),
                cosignatories: this.get('cosignatories')
                    .filter(function(e){ return (!!e.address); })
                    .map(function(e){ return {'address':e.address}}),
                minCosignatories: {'relativeChange': this.get('minCosignatoriesNumber') },
                hoursDue: this.get('hoursDue')
            };
            var self = this;

            ncc.postRequest('wallet/account/modification/validate', requestData,
                function(data) {
                    self.set('minimumFee', data.fee);
                },
                {
                    altFailCb: function(faultId, error) {
                    }
                }, options.silent
            );
        },
		addCosignatory: function() {
            this.get('cosignatories').push({
                formattedAddress:'',
                readOnly:false,
                canRemoveRow: true
            });
            $('.js-cosignatory')
                .last()
                .typeahead(this.typeaheadSettings, this.typeaheadData);
                /* this does not work neither .on nor .bind
                .on('typeahead:select', function(ev, suggestion) {
                    console.log('Selection: ' + suggestion);
                })
                .on('typeahead:autocomplete', function(ev, suggestion) {
                    console.log('autocomplete: ' + suggestion);
                });
                */

            $('.js-cosignatory').last().focus();

            this.resetMinCosignatories();

//            var self = this;
//            var $cosignatory = $('.js-cosignatory').last();
//            $cosignatory.on('keypress', function(e) { Utils.mask.keypress(e, 'address', self); });
//            $cosignatory.on('paste', function(e) { Utils.mask.paste(e, 'address', self); });
//            $cosignatory.on('keydown', function(e) { Utils.mask.keydown(e, 'address', self); });
        },
        removeCosignatory: function(index) {
            this.get('cosignatories').splice(index, 1);
            this.resetMinCosignatories();
        },
        deleteCosignatory: function(index) {
            var e = this.get('cosignatories')[index];
            e['deleted'] = !e['deleted'];
            this.update('cosignatories'); // trigger cosignatories observers

            this.resetMinCosignatories();
        },
        resetCosignatories: function() {
            var multisigAccount = this.get('multisigAccount');
            if (multisigAccount && multisigAccount.isMultisig) {
                var cosigs = multisigAccount.cosignatories.map(function(a){ return {
                    formattedAddress: Utils.format.address.format(a.address),
                    readOnly: true,
                    canRemoveRow: false,
                    canDeleteCosig: true,
                    deleted: false
                };});
                this.set('cosignatories', cosigs);

            } else {
                var activeFormattedAddress = Utils.format.address.format(ncc.get('activeAccount.address'));
                this.set('cosignatories', [{
                    formattedAddress:activeFormattedAddress,
                    readOnly: false,
                    canRemoveRow: false
                }]);
            }

            // add empty
            this.addCosignatory();

            // since we've changed val(), we need a typeahead hack
            $('.js-cosignatory').each(function(i){
                $(this).typeahead('val', $(this).val());
            });
        },
        resetDefaultData: function() {
            // get all non-multisig from the wallet
            var usableAccounts = ncc.get('allAccounts').filter(function(a){ return !a.isMultisig; });
            // and get multisig of a current account
            var multisigsOfCurrent = [];
            var wallet = ncc.get('wallet');
            ncc.get('activeAccount').multisigAccounts.forEach(function(a){
                if (a.address in wallet.allMultisigAccounts) {
                    var acct = wallet.allMultisigAccounts[a.address];
                    var t = {
                        address: acct.address,
                        isMultisig: true,
                        cosignatories: acct.cosignatories,
                        minCosignatories: a.multisigInfo.minCosignatories
                    };
                    multisigsOfCurrent.push(t);
                }
            });

            this.set('allAccounts', usableAccounts.concat(multisigsOfCurrent));
            this.set('privateLabels', ncc.get('privateLabels'));
            this.resetCosignatories();

            this.set('cosignatoriesValid', false);
            this.set('warningShown', false);
            this.set('multisigAccount', '');
            this.set('fee', 0);
            this.set('minimumFee', 0);
            this.set('dueBy', '1');
            this.set('password', '');
            this.set('useMinimumFee', true);
            this.set('useDefaultMinCosignatories', true);
            this.set('minCosignatories', 0);

            this.set('feeChanged', false);
            this.set('passwordChanged', true);
            this.resetFee({ silent: true });
        },
        sendTransaction: function() {
            var requestData = {
                wallet: ncc.get('wallet.wallet'),
                account: this.get('multisigAccount'),
                type: 3, // multisig aggregate
                cosignatories: this.get('cosignatories')
                    .filter(function(e){ return (!!e.address); })
                    .map(function(e){ return {'address':e.address, 'deleted':e.deleted}}),
                minCosignatories: {'relativeChange': this.get('minCosignatoriesNumber') },
                password: this.get('password'),
                fee: this.get('fee'),
                hoursDue: this.get('hoursDue')
            };

            var txConfirm = ncc.getModal('modificationConfirm');
            txConfirm.set('txData', this.get());
            txConfirm.set('requestData', requestData);
            txConfirm.open();
        },
        doCosignatoryCheck: function() {
            var multisigAccount = this.get('multisigAccount');
            var cosignatories = this.get('cosignatories');

            //if (! multisigAccount) {
            //    return;
            //}
            this.set('cosignatoriesValid', true);
            for (var i=0; i<cosignatories.length; ++i) {
                if (cosignatories[i].address.length !== 40) {
                    this.set('cosignatoriesValid', false);
                    this.set('cosignatories['+i+'].error', true);
                } else {
                    this.set('cosignatories['+i+'].error', false);
                }
            }
            //if (! multisigAccount) {
            //    return;
            //}
            if (this.get('cosignatoriesValid') === true) {
                for (var i=0; i<cosignatories.length; ++i) {
                    if ((cosignatories[i].address === multisigAccount.address)) {
                        this.set('cosignatoriesValid', false);
                        this.set('cosignatories['+i+'].error', true);
                    } else {
                        this.set('cosignatories['+i+'].error', false);
                    }
                }
                if (this.get('warningShown') === false && this.get('cosignatoriesValid') === false) {
                    ncc.showMessage(ncc.get('texts.modals.multisig.title'), ncc.get('texts.modals.multisig.warning'));
                    this.set('warningShown', true);
                }
            }
        },
        resetMinCosignatories: function() {
            if (this.get('useDefaultMinCosignatories')) {
                var c = this.get('cosignatories');
                if (this.get('multisigAccount') && this.get('multisigAccount').isMultisig) {
                    if (this.get('multisigAccount').minCosignatories || 1) {
                        console.log("COSIGS min", c);
                        var existing = c.filter(function(a){return a.deleted === false || a.deleted === true;}).length;
                        var removed = c.filter(function(a){return a.deleted === true;}).length;
                        var added = c.filter(function(a){return a.deleted === undefined && a.address;}).length;
                        this.set('minCosignatories', existing - removed + added);

                    } else {
                        this.set('minCosignatories', 0);
                    }
                } else {
                    this.set('minCosignatories', c.length);
                }
            }
        },
        typeaheadSettings: {
            hint: false,
            highlight: true
        },
        typeaheadData: {
            name: 'address-book',
            source: Utils.typeahead.addressBookMatcher,
            displayKey: 'formattedAddress',
            templates: {
                suggestion: Handlebars.compile('<span class="abSuggestion-label">{{privateLabel}}</span>')
            }
        },
        onrender: function() {
            this._super();
            var self = this;

            this.resetDefaultData();

            this.observe({
                'cosignatories': (function() {
                    var t;
                    return function(objs) {
                        // that's bit dumb ;p
                        for (var i = 0; i<objs.length; ++i) {
                            self.set('cosignatories['+i+'].address', Utils.format.address.restore(objs[i].formattedAddress));
                        }
                        clearTimeout(t);
                        t = setTimeout(function() {
                            self.resetFee({ silent: true });
                        }, 500);

                        self.doCosignatoryCheck();
                    }
                })()
            },
            {
                init: false
            });
            this.observe({
                minCosignatories: function() {
                    if (this.get('minCosignatories')==null || this.get('minCosignatories')==='' || parseInt(this.get('minCosignatories'),10)===0) {
                        this.set('minCosignatoriesZero', true);
                    } else {
                        this.set('minCosignatoriesZero', false);
                    }
                    if (parseInt(this.get('minCosignatories'), 10) > this.get('cosignatories').length) {
                        this.set('minCosignatoriesOverflow', true);
                    } else {
                         this.set('minCosignatoriesOverflow', false);
                     }
                },
                useDefaultMinCosignatories: function() {
                    self.resetMinCosignatories();
                },
                useMinimumFee: function(useMinimumFee) {
                    if (useMinimumFee) {
                        this.set('fee', this.get('minimumFee'));
                    }
                },
                minimumFee: function(minimumFee) {
                    if (this.get('useMinimumFee')) {
                        this.set('fee', minimumFee);
                    }
                }
            });
            this.observe({
                fee: function() {
                    this.set('feeChanged', true);
                },
                password: function() {
                    this.set('passwordChanged', true);
                },
                multisigAccount: function() {
                    this.resetCosignatories();
                    this.doCosignatoryCheck();
                }
            },
            {
                init: false
            });
            this.on({
                sendFormKeypress: function(e) {
                    if (e.original.keyCode === 13 && this.get('formValid')) {
                        this.sendTransaction();
                    }
                },
                modalOpened: function() {
                    $('.js-cosignatory').focus();
                    this.resetDefaultData();
                },
                modalClosed: function() {
                    this.resetDefaultData();
                }
            });

            var $dueBy = $('.js-multisig-dueBy-textbox');
            $dueBy.on('keypress', function(e) { Utils.mask.keypress(e, 'number', self) });
            $dueBy.on('paste', function(e) { Utils.mask.paste(e, 'number', self); });
            $dueBy.on('keydown', function(e) { Utils.mask.keydown(e, 'number', self); });

            var $minCosignatories = $('.js-multisig-mincosignatories-textbox');
            $minCosignatories.on('keypress', function(e) { Utils.mask.keypress(e, 'number', self) });
            $minCosignatories.on('paste', function(e) { Utils.mask.paste(e, 'number', self); });
            $minCosignatories.on('keydown', function(e) { Utils.mask.keydown(e, 'number', self); });

//            var $cosignatory = $('.js-cosignatory');
//            $cosignatory.on('keypress', function(e) { Utils.mask.keypress(e, 'address', self); });
//            $cosignatory.on('paste', function(e) { Utils.mask.paste(e, 'address', self); });
//            $cosignatory.on('keydown', function(e) { Utils.mask.keydown(e, 'address', self); });

            var $fee = $('.js-multisig-fee-textbox');
            var feeTxb = $fee[0];
            $fee.on('keypress', function(e) { Utils.mask.keypress(e, 'nem', self); });
            $fee.on('paste', function(e) { Utils.mask.paste(e, 'nem', self); });
            $fee.on('keydown', function(e) { Utils.mask.keydown(e, 'nem', self); });

            this.listeners.push(ncc.observe({
                'texts.preferences.thousandSeparator': function(newProp, oldProp) {
                    feeTxb.value = Utils.format.nem.reformat(feeTxb.value, oldProp, newProp);
                },
                'texts.preferences.decimalSeparator': function(newProp, oldProp) {
                    feeTxb.value = Utils.format.nem.reformat(feeTxb.value, null, null, oldProp, newProp);
                }
            }));
            // Cosignatory fields
        }
	});
});
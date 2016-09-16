/**
 * Edit widget
 * @author Patrick Oladimeji
 * @date 11/5/13 13:16:05 PM
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, Handlebars, $*/
define(function (require, exports, module) {
    "use strict";
    var FormUtils					= require("./FormUtils"),
        template					= require("text!./templates/editWidget.handlebars"),
        BaseDialog                  = require("pvsioweb/forms/BaseDialog"),
        d3							= require("d3/d3");

    function updateBoundFunctionsLabel() {
        var f = d3.select("#functionText").property("value"),
            str = "",
            events = [];
        d3.select("#events").selectAll("input[type='radio']").each(function () {
            if (this.checked) {
                events = events.concat(this.value.split("/"));
            }
        });
        str = events.map(function (d) {
            return d + "_" + f;
        }).join(", ");
        d3.select("#boundFunctions").text(str);
    }
    function updateTimerEvent() {
        var f = d3.select("#timerEvent").property("value");
        d3.select("#timerFunction").text(f);
    }

    var EditWidgetView	= BaseDialog.extend({
        render: function (widget) {
            var t = Handlebars.compile(template);
            var widgetData = widget.toJSON();
            widgetData.isDisplay = widget.type() === "display";
            widgetData.isButton = widget.type() === "button";
            widgetData.isTouchscreenButton = widget.type() === "touchscreenbutton";
            widgetData.isLED = widget.type() === "led";
            widgetData.isTimer = widget.type() === "timer";
            this.$el.html(t(widgetData));
            $("body").append(this.el);
            this.widget = widget;

            //update form
            if (widgetData.isButton || widgetData.isTouchscreenButton) {
                widget.evts().forEach(function (e) {
                    d3.select("input[type='radio'][value='" + e + "']").property("checked", true);
                });
            }
            if (widget.auditoryFeedback && widget.auditoryFeedback() === "enabled") {
                d3.select("input[type='checkbox'][name='auditoryFeedback']").property("checked", true);
            }
            return this;
        },
        events: {
            "change input[type='radio'][name='evts']": "eventsChanged",
            "click #btnOk": "ok",
            "click #btnCancel": "cancel",
            "keyup #functionText": "eventsChanged",
            "keyup #timerEvent": "timerEventChanged"
        },
        eventsChanged: function (event) {
            updateBoundFunctionsLabel();
        },
        timerEventChanged: function (event) {
            updateTimerEvent();
        },
        ok: function (event) {
            var form = this.el;
            if (FormUtils.validateForm(form)) {
                var formdata = FormUtils.serializeForm(form, "input");
                // update auditory feedback and touchscreen properties if the properties are supported by the widget
                if (this.widget.auditoryFeedback) {
                    formdata.auditoryFeedback = (d3.select("input[type='checkbox'][name='auditoryFeedback']").property("checked")) ? "enabled" : "disabled";
                }
                if (this.widget.touchscreenvisibleWhen && formdata.touchscreenvisibleWhen && formdata.touchscreenvisibleWhen !== "") {
                    formdata.touchscreenEnabled = true;
                }
                // group together style properties
                formdata.style = formdata.style || {};
                formdata.style.fontsize = formdata.style.fontsize || formdata.fontsize;
                formdata.style.backgroundColor = formdata.style.backgroundColor || formdata.backgroundColor;
                // trigger event
                this.trigger("ok", { data: formdata, el: this.el, event: event }, this);
            }
        },
        cancel: function (event) {
            this.trigger("cancel", {el: this.el, event: event}, this);
        }
    });

    module.exports = {
        create: function (widget) {
            return new EditWidgetView(widget);
        }
    };
});

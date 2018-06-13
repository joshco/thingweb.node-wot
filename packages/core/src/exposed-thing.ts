/********************************************************************************
 * Copyright (c) 2018 Contributors to the Eclipse Foundation
 * 
 * See the NOTICE file(s) distributed with this work for additional
 * information regarding copyright ownership.
 * 
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0, or the W3C Software Notice and
 * Document License (2015-05-13) which is available at
 * https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document.
 * 
 * SPDX-License-Identifier: EPL-2.0 OR W3C-20150513
 ********************************************************************************/

import * as WoT from "wot-typescript-definitions";
import { Subject } from "rxjs/Subject";

import * as TD from "@node-wot/td-tools";

import Servient from "./servient";
import ConsumedThing from "./consumed-thing";
import * as TDGenerator from "./td-generator"
import * as Rest from "./resource-listeners/all-resource-listeners";
import { ResourceListener } from "./resource-listeners/protocol-interfaces";
import { Content, ContentSerdes } from "./content-serdes";


abstract class ExposedThingInteraction {
    label: string;
    forms: Array<WoT.Form>;
    links: Array<WoT.Link>;
}

class ExposedThingProperty
// extends TD.ThingProperty
extends ExposedThingInteraction
implements WoT.ThingProperty, WoT.DataSchema
{
    writable: boolean;
    observable: boolean;
    value: any;

    type: WoT.DataType;
   

    thingName : string;
    propertyName : string;
    propertyState : PropertyState;
    

    constructor(thingName : string, propertyName : string, propertyState : PropertyState) {
        super();
        this.thingName = thingName;
        this.propertyName = propertyName;
        this.propertyState = propertyState;
    }

    // getter for PropertyInit properties
    // get(name: string): any {

    // }
    // get and set interface for the Property
    get(): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            if (this.propertyState) {
                // call read handler (if any)
                if (this.propertyState.readHandler != null) {
                    console.log(`ExposedThing '${this.thingName}' calls registered readHandler for property ${this.propertyName}`);
                    this.value = this.propertyState.value = this.propertyState.readHandler.call(this.propertyState.that);
                } else {
                    console.log(`ExposedThing '${this.thingName}' reports value ${this.propertyState.value} for property ${this.propertyName}`);
                }

                resolve(this.propertyState.value);
            } else {
                reject(new Error("No property called " + this.propertyName));
            }
        });
    }
    set(value: any): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // call write handler (if any)
            if (this.propertyState.writeHandler != null) {
                console.log(`ExposedThing '${this.thingName}' calls registered writeHandler for property ${this.propertyName}`);
                this.propertyState.value = this.propertyState.writeHandler.call(this.propertyState.that, value);
            } else {
                console.log(`ExposedThing '${this.thingName}' sets new value ${value} for property ${this.propertyName}`);
                this.propertyState.value = value;
            }

            resolve();
        });
    }
}

class ExposedThingAction
// extends TD.ThingAction
extends ExposedThingInteraction
implements WoT.ThingAction {
    
    thingName : string;
    actionName : string;
    actionState : ActionState;
    

    constructor(thingName : string, actionName : string, actionState : ActionState) {
        super();
        this.thingName = thingName;
        this.actionName = actionName;
        this.actionState = actionState;
    }


    run(parameter?: any) : Promise<any> {
        return new Promise<any>((resolve, reject) => {
            if (this.actionState) {
                // TODO debug-level
                console.debug(`ExposedThing '${this.thingName}' Action state of '${this.actionName}':`, this.actionState);

                if (this.actionState.handler != null) {
                    let handler = this.actionState.handler;
                    resolve(handler(parameter));
                } else {
                    reject(new Error(`ExposedThing '${this.thingName}' has no action handler for '${this.actionName}'`));
                }
            } else {
                reject(new Error(`ExposedThing '${this.thingName}' has no Action '${this.actionName}'`));
            }
        });
    }
}

class ExposedThingEvent extends ExposedThingProperty implements WoT.ThingEvent {
}



export default class ExposedThing
extends ConsumedThing
implements
    // TD.Thing, 
    WoT.ConsumedThing, WoT.ExposedThing {
    private propertyStates: Map<string, PropertyState> = new Map<string, PropertyState>();
    private actionStates: Map<string, ActionState> = new Map<string, ActionState>();
    private interactionObservables: Map<string, Subject<Content>> = new Map<string, Subject<Content>>();
    private restListeners: Map<string, ResourceListener> = new Map<string, ResourceListener>();

    constructor(servient: Servient, td: WoT.ThingDescription) {
        // TODO check if extending ConsumedThing is worth the complexity
        super(servient, td);

        // create state for all initial Interactions
        for (let propertyName in this.thing.properties) {
            let property = this.thing.properties[propertyName];
            this.propertyStates.set(propertyName, new PropertyState());
            this.addResourceListener("/" + this.name + "/properties/" + propertyName, new Rest.PropertyResourceListener(this, propertyName));
        }
        for (let actionName in this.thing.actions) {
            let action = this.thing.actions[actionName];
            this.actionStates.set(actionName, new ActionState());
            this.addResourceListener("/" + this.name + "/actions/" + actionName, new Rest.PropertyResourceListener(this, actionName));
        }
        for (let eventName in this.thing.events) {
            let event = this.thing.events[eventName];
            // TODO connection to bindings
        }

        /*
        for (let inter of this.interaction) {
            // reset forms in case already set via ThingModel
            inter.form = [];
            if (inter.pattern === TD.InteractionPattern.Property) {
                this.propertyStates.set(inter.name, new PropertyState());
                this.addResourceListener("/" + this.name + "/properties/" + inter.name, new Rest.PropertyResourceListener(this, inter.name));
            } else if (inter.pattern === TD.InteractionPattern.Action) {
                this.actionStates.set(inter.name, new ActionState());
                this.addResourceListener("/" + this.name + "/actions/" + inter.name, new Rest.ActionResourceListener(this, inter.name));
            } else if (inter.pattern === TD.InteractionPattern.Event) {
                // TODO connection to bindings
            } else {
                console.error(`ExposedThing '${this.name}' ignoring unknown Interaction '${inter.name}':`, inter);
            }  
        }
        */

        // expose Thing
        this.addResourceListener("/" + this.name, new Rest.TDResourceListener(this));
    }

    // setter for ThingTemplate properties
    public set(name: string, value: any): void {
        
    }

    public getThingDescription(): WoT.ThingDescription {
        return TD.serializeTD(TDGenerator.generateTD(this, this.srv));
    }

    private addResourceListener(path: string, resourceListener: ResourceListener) {
        this.restListeners.set(path, resourceListener);
        this.srv.addResourceListener(path, resourceListener);
    }

    private removeResourceListener(path: string) {
        this.restListeners.delete(path);
        this.srv.removeResourceListener(path);
    }

    /*
    public getInteractions(): Array<TD.Interaction> {
        // returns a copy -- FIXME: not a deep copy
        return this.interaction.slice(0);
    }
    */

    /**
     * Read a given property
     * @param propertyName Name of the property
     */
    // public readProperty(propertyName: string): Promise<any> {
    //     return new Promise<any>((resolve, reject) => {
    //         let state = this.propertyStates.get(propertyName);
    //         if (state) {
    //             // call read handler (if any)
    //             if (state.readHandler != null) {
    //                 console.log(`ExposedThing '${this.name}' calls registered readHandler for property ${propertyName}`);
    //                 state.value = state.readHandler.call(state.that);
    //             } else {
    //                 console.log(`ExposedThing '${this.name}' reports value ${state.value} for property ${propertyName}`);
    //             }

    //             resolve(state.value);
    //         } else {
    //             reject(new Error("No property called " + propertyName));
    //         }
    //     });
    // }

    // /**
    //  * Write a given property
    //  * @param propertyName of the property
    //  * @param newValue value to be set
    //  */
    // public writeProperty(propertyName: string, newValue: any): Promise<void> {
    //     return new Promise<void>((resolve, reject) => {
    //         let state = this.propertyStates.get(propertyName);
    //         if (state) {
    //             // call write handler (if any)
    //             if (state.writeHandler != null) {
    //                 console.log(`ExposedThing '${this.name}' calls registered writeHandler for property ${propertyName}`);
    //                 state.value = state.writeHandler.call(state.that, newValue);
    //             } else {
    //                 console.log(`ExposedThing '${this.name}' sets new value ${newValue} for property ${propertyName}`);
    //                 state.value = newValue;
    //             }

    //             resolve();
    //         } else {
    //             reject(new Error("No property called " + propertyName));
    //         }
    //     });
    // }

    // /** invokes an action on the target thing
    //  * @param actionName Name of the action to invoke
    //  * @param parameter optional json object to supply parameters
    // */
    // public invokeAction(actionName: string, parameter?: any): Promise<any> {
    //     return new Promise<any>((resolve, reject) => {
    //         let state = this.actionStates.get(actionName);
    //         if (state) {
    //             // TODO debug-level
    //             console.debug(`ExposedThing '${this.name}' Action state of '${actionName}':`, state);

    //             if (state.handler != null) {
    //                 let handler = state.handler;
    //                 resolve(handler(parameter));
    //             } else {
    //                 reject(new Error(`ExposedThing '${this.name}' has no action handler for '${actionName}'`));
    //             }
    //         } else {
    //             reject(new Error(`ExposedThing '${this.name}' has no Action '${actionName}'`));
    //         }
    //     });
    // }

    // define how to expose and run the Thing
    /** @inheritDoc */


    /** @inheritDoc */
    expose(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
        });
    }

    /** @inheritDoc */
    destroy(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
        });
    }

    /** @inheritDoc */
    public emitEvent(eventName: string, value: any): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.interactionObservables.get(eventName).next(ContentSerdes.get().valueToContent(value));
            resolve();
        });
    }

 

    /** @inheritDoc */
    addProperty(name: string, property: WoT.ThingProperty): WoT.ExposedThing {

        console.log(`ExposedThing '${this.name}' adding Property '${name}'`);

        let state = new PropertyState();
        let newProp = new ExposedThingProperty(this.name, name, state);

        newProp.label = property.label;
        newProp.writable = property.writable;
        newProp.observable = property.observable;
        // newProp.type = JSON.parse(property.type);
        newProp.forms = [{href: "", rel:"", security: null}];

        // TODO metadata
        //action.semanticType
        //action.metadata
        this.properties[name] = newProp;
        this.thing.properties[name] = newProp;

        // FIXME does it makes sense to push the state to the ResourceListener?
        let value: any = property.value; // property.get();
        if (value != null) {
            state.value = value;
            console.log(`ExposedThing '${this.name}' sets initial property '${name}' to '${state.value}'`);
        }
        this.propertyStates.set(name, state);
        this.addResourceListener("/" + this.name + "/properties/" + name, new Rest.PropertyResourceListener(this, name));

        // inform TD observers
        this.observablesTDChange.next(this.getThingDescription());

        return this;
    }

    /** @inheritDoc */
    addAction(name: string, action: WoT.ThingAction): WoT.ExposedThing {

        console.log(`ExposedThing '${this.name}' adding Action '${name}'`);

        let state = new ActionState();
        let newAction = new ExposedThingAction(this.thing.name, name, state);

        newAction.label = action.label;
        // newAction.input = action.input; // inputSchema ? JSON.parse(action.inputSchema) : null;
        // newAction.output = action.output; // outputSchema ? JSON.parse(action.outputSchema) : null;

        // TODO metadata
        //action.semanticType
        //action.metadata
        this.actions[name] = newAction;
        this.thing.actions[name] = newAction;

        this.actionStates.set(name, state);
        this.addResourceListener("/" + this.name + "/actions/" + name, new Rest.ActionResourceListener(this, name));

        // inform TD observers
        this.observablesTDChange.next(this.getThingDescription());

        return this;
    }

    /**
     * declare a new eventsource for the ExposedThing
     */
    addEvent(name: string, event: WoT.ThingEvent): WoT.ExposedThing {
        // eventName: string
        let newEvent = new ExposedThingEvent(this.thing.name, name, null);
        newEvent.label = event.label; // event.name;
        // newEvent.schema = JSON.parse(event.schema);

        this.thing.events[name] = newEvent;


        let subject = new Subject<Content>();

        // lookup table for emitEvent()
        this.interactionObservables.set(name, subject);
        // connection to bindings, which use ResourceListeners to subscribe/unsubscribe
        this.addResourceListener("/" + this.name + "/events/" + name, new Rest.EventResourceListener(name, subject));

        // inform TD observers
        this.observablesTDChange.next(this.getThingDescription());

        return this;
    }

    /** @inheritDoc */
    removeProperty(propertyName: string): WoT.ExposedThing {
        this.interactionObservables.get(propertyName).complete();
        this.interactionObservables.delete(propertyName);
        this.propertyStates.delete(propertyName);
        this.removeResourceListener(this.name + "/properties/" + propertyName);

        // inform TD observers
        this.observablesTDChange.next(this.getThingDescription());

        return this;
    }

    /** @inheritDoc */
    removeAction(actionName: string): WoT.ExposedThing {
        this.actionStates.delete(actionName);
        this.removeResourceListener(this.name + "/actions/" + actionName);

        // inform TD observers
        this.observablesTDChange.next(this.getThingDescription());

        return this;
    }

    /** @inheritDoc */
    removeEvent(eventName: string): WoT.ExposedThing {
        this.interactionObservables.get(eventName).complete();
        this.interactionObservables.delete(eventName);
        this.removeResourceListener(this.name + "/events/" + eventName);

        // inform TD observers
        this.observablesTDChange.next(this.getThingDescription());

        return this;
    }

    /** @inheritDoc */
    setActionHandler(actionName: string, action: WoT.ActionHandler): WoT.ExposedThing {
        console.log(`ExposedThing '${this.name}' setting action Handler for '${actionName}'`);
        let state = this.actionStates.get(actionName);
        if (state) {
            state.handler = action;
        } else {
            throw Error(`ExposedThing '${this.name}' cannot set action handler for unknown '${actionName}'`);
        }

        return this;
    }

    /** @inheritDoc */
    setPropertyReadHandler(propertyName: string, readHandler: WoT.PropertyReadHandler): WoT.ExposedThing {
        console.log(`ExposedThing '${this.name}' setting read handler for '${propertyName}'`);
        let state = this.propertyStates.get(propertyName);
        if (state) {
            state.readHandler = readHandler;
        } else {
            throw Error(`ExposedThing '${this.name}' cannot set read handler for unknown '${propertyName}'`);
        }
        return this;
    }

    /** @inheritDoc */
    setPropertyWriteHandler(propertyName: string, writeHandler: WoT.PropertyWriteHandler): WoT.ExposedThing {
        console.log(`ExposedThing '${this.name}' setting write handler for '${propertyName}'`);
        let state = this.propertyStates.get(propertyName);
        if (state) {
            state.writeHandler = writeHandler;
        } else {
            throw Error(`ExposedThing '${this.name}' cannot set write handler for unknown '${propertyName}'`);
        }
        return this;
    }

}

class PropertyState {
    public that: Function;
    public value: any;

    public writeHandler: Function;
    public readHandler: Function;

    constructor() {
        this.that = new Function();
        this.value = null;
        this.writeHandler = null;
        this.readHandler = null;
    }

}

class ActionState {
    public that: Function;
    public handler: Function;
    constructor() {
        this.that = new Function();
        this.handler = null;
    }
}
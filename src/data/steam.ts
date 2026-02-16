import {type Component} from "vue";

export interface ClickSelectEventImpl {
    "id": string,
    "value": boolean,
    "path": string[],
    "event": PointerEvent
}

export interface SteamLaunchOptionsImpl {
    name: string,
    description?: string,
    replace_numbers?: boolean,
    default_parameter?: string,
    parameter?: string | string[],
    parameters?: SteamLaunchOptionsImpl[],
    identifier?: string,
    requirement?: string | string[], //需要的前置条件
    requirement_description?: string,
    tip?: Component | null
}


export class SteamLaunchOptionsItem implements SteamLaunchOptionsImpl {
    name: string
    description?: string
    replace_numbers?: boolean
    default_parameter?: string
    parameter?: string | string[]
    parameters?: SteamLaunchOptionsImpl[]
    identifier?: string
    requirement?: string | string[] //需要的前置条件
    requirement_description?: string

    constructor(
        name: string,
        description?: string,
        replace_numbers?: boolean,
        default_parameter?: string,
        parameter?: string | string[],
        parameters?: SteamLaunchOptionsImpl[],
        identifier?: string,
        requirement?: string | string[], //需要的前置条件
        requirement_description?: string,
    ) {
        this.name = name;
        this.description = description;
        this.replace_numbers = replace_numbers;
        this.default_parameter = default_parameter;
        this.parameter = parameter;
        this.parameters = parameters;
        this.identifier = identifier;
        this.requirement = requirement;
        this.requirement_description = requirement_description;
    }

}



export interface Ipv {
    address: string,
    port: number,
}

export interface PortForwarding {
    listen: Ipv,
    connect: Ipv,
}

export interface SteamUser {
    name: string,
    id: string,
    avatar: string,
    config_path: string,
}
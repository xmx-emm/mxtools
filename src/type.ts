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

export interface WindowsUser {
    name: string,
    is_rdp_user: boolean,
}

export interface RdpConnection {
    name: string,
    ip: string,
    port: number,
    username: string,
}
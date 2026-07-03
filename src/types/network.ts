export interface Ipv {
  address: string;
  port: number;
}

export interface PortForwarding {
  listen: Ipv;
  connect: Ipv;
}

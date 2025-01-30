export class Webembot {
  static async create() {
    const uuid = (s) => `f7fc${s}-7a0b-4b89-a675-a79137223e2c`;
    const opt = {
      optionalServices: [uuid("e510")],
      filters: [
        { namePrefix: "EMBOT_" },
        { namePrefix: "EMBOTPLUS_" },
      ],
    };
    const device = await navigator.bluetooth.requestDevice(opt);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(uuid("e510"));
    const embot = new Webembot(device, server, service);
    embot.leds = [
      await service.getCharacteristic(uuid("e515")),
      await service.getCharacteristic(uuid("e516")),
    ];
    embot.servos = [
      await service.getCharacteristic(uuid("e511")),
      await service.getCharacteristic(uuid("e512")),
      await service.getCharacteristic(uuid("e513")),
    ];
    embot.buzzer1 = await service.getCharacteristic(uuid("e521"));
    embot.other1 = await service.getCharacteristic(uuid("e525"));
    return embot;
  }
  constructor(device, server, service) {
    this.device = device;
    this.server = server;
    this.service = service;
  }
  async writeBLE(char, val) {
    const buf = new Uint8Array(1);
    buf[0] = parseInt(val);
    await char.writeValueWithoutResponse(buf.buffer);
  }
  async led(id, val) { // id: 1 or 2, val: true or false
    if (id < 1 || id > 2) throw new Error("id must be 1 to 2");
    const target = this.leds[id - 1];
    await this.writeBLE(target, val ? 1 : 2);
  }
  async servo(id, val) { // id: 1-3, val: 0?
    if (id < 1 || id > 3) throw new Error("id must be 1 to 3");
    const target = this.servos[id - 1];
    await this.writeBLE(target, val);
  }
  async buzzer(val = 61) {
    const target = this.buzzer1;
    await this.writeBLE(target, val);
  }
}

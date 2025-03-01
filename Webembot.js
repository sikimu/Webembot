const uuid = (s) => `f7fc${s}-7a0b-4b89-a675-a79137223e2c`;

export class Webembot {
  static async create() {
    const ruuid = (uuid) => uuid.substring(4, 8);
    const opt = {
      optionalServices: [uuid("e510")],
      filters: [
        { namePrefix: "EMBOT_" },
        { namePrefix: "EMBOTPLUS_" },
        { namePrefix: "F503i_" },
      ],
    };
    const device = await navigator.bluetooth.requestDevice(opt);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(uuid("e510"));
    
    // 全てのCharacteristicsを取得してUUIDを表示
    const chs = await service.getCharacteristics();
    for (const ch of chs) {
      const show = (p) => {
        const names = [
          "authenticatedSignedWrites",
          "broadcast",
          "indicate",
          "notify",
          "read",
          "reliableWrite",
          "writableAuxiliaries",
          "write",
          "writeWithoutResponse",
        ];
        const ss = [];
        for (const name of names) {
          if (p[name]) ss.push(name);
        }
        return ss.join(" ");
      };
      console.log(ruuid(ch.uuid), show(ch.properties));
    }
    console.log();
    
    const plus = device.name.startsWith("EMBOTPLUS_");
    const f503i = device.name.startsWith("F503i_");
    return new Webembot(device, server, service, plus, f503i);
  }

  constructor(device, server, service, plus, f503i) {
    this.device = device;
    this.server = server;
    this.service = service;
    this.plus = plus;
    this.f503i = f503i;
  }

  async getCharacteristicsInfo() {
    const characteristics = await this.service.getCharacteristics();
    return await Promise.all(characteristics.map(async ch => {
      const properties = [];
      const propertyNames = [
        "authenticatedSignedWrites",
        "broadcast",
        "indicate",
        "notify",
        "read",
        "reliableWrite",
        "writableAuxiliaries",
        "write",
        "writeWithoutResponse"
      ];
      
      for (const name of propertyNames) {
        if (ch.properties[name]) {
          properties.push(name);
        }
      }

      let value = "読み取り不可";
      if (ch.properties.read) {
        try {
          const data = await ch.readValue();
          if (data.buffer.byteLength === 1) {
            value = new Uint8Array(data.buffer)[0].toString();
          } else if (data.buffer.byteLength === 2) {
            const bytes = new Uint8Array(data.buffer);
            value = ((bytes[1] << 8) | bytes[0]).toString();
          } else {
            value = Array.from(new Uint8Array(data.buffer)).join(", ");
          }
        } catch (error) {
          console.error(`UUID ${ch.uuid} の値の読み取りに失敗:`, error);
          value = "エラー";
        }
      }

      return {
        uuid: ch.uuid,
        shortUuid: ch.uuid.substring(4, 8),
        properties: properties.join(", "),
        value: value
      };
    }));
  }
}

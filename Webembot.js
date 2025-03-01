export class Webembot {
  static async create() {
    const uuid = (s) => `f7fc${s}-7a0b-4b89-a675-a79137223e2c`;
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
    // check all
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
    const embot = new Webembot(device, server, service, plus, f503i);
    if (!f503i) {
      embot.leds = [
        await service.getCharacteristic(uuid("e515")),
        await service.getCharacteristic(uuid("e516")),
      ];
    } else {
      embot.leds = [
        await service.getCharacteristic(uuid("e515")),
        await service.getCharacteristic(uuid("e516")),
        await service.getCharacteristic(uuid("e517")),
        await service.getCharacteristic(uuid("e518")),
        await service.getCharacteristic(uuid("e51a")),
        await service.getCharacteristic(uuid("e51b")),
      ];
    }
    if (!f503i) {
      embot.servos = [
        await service.getCharacteristic(uuid("e511")),
        await service.getCharacteristic(uuid("e512")),
      ];
      if (plus) {
        embot.servos.push(await service.getCharacteristic(uuid("e513")));
      }
    }
    embot.buzzer1 = await service.getCharacteristic(uuid("e521"));
    //embot.other1 = await service.getCharacteristic(uuid("e525"));
    if (f503i) {
      const uuidread = ["e515", "e516", "e532", "e5e1", "e5e2", "e5e3", "e5e4"];
      embot.others = [];
      for (const i of uuidread) {
        const ch = await service.getCharacteristic(uuid(i));
        embot.others.push(ch);
      }
      for (const i of ["e531", "e532"]) {
        const ch = await service.getCharacteristic(uuid(i));
        if (i === "e532") {
          // 光センサーの初期化（f503iの場合のみ）
          try {
            console.log('光センサーの初期化を開始...');
            const buf = new Uint8Array(1);
            buf[0] = 2;  // モード2：連続読み取りモード
            await ch.writeValueWithoutResponse(buf.buffer);
            console.log('光センサーモードを設定しました');
          } catch (error) {
            console.error('光センサー初期化エラー:', error.name, error.message);
          }
        }
        ch.addEventListener('characteristicvaluechanged', async e => {
          const data = new Uint8Array(e.target.value.buffer);
          const n = (data[1] << 8) | data[0]; // data.length == 2
          // LSMから 0-9*#
          //console.log('recv', i, n.toString(2)); // data.length, data);
          embot.setKeyState(n);
        });
        await ch.startNotifications();
      }
    }
    return embot;
  }
  constructor(device, server, service, plus, f503i) {
    this.device = device;
    this.server = server;
    this.service = service;
    this.plus = plus;
    this.f503i = f503i;
    this.keylisteners = [];
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

  async writeBLE(char, val) {
    const buf = new Uint8Array(1);
    buf[0] = parseInt(val);
    await char.writeValueWithoutResponse(buf.buffer);
  }
  async led(id, val) { // id: 1 or 2, val: true or false
    if (id < 1 || id > this.leds.length) {
      console.log("led " + id + " is not supported");
      return;
    }
    const target = this.leds[id - 1];
    await this.writeBLE(target, val ? 1 : 2);
    /*
    if (this.f503i) {
      await this.writeBLE(target, val ? 1 : 0);
    } else {
      await this.writeBLE(target, val ? 1 : 2);
    }
    */
  }
  async servo(id, val) { // id: 1-3, val: 0?
    if (this.f503i) {
      console.log("servo is not supported");
      return;
    }
    if (id < 1 || id > 3) throw new Error("id must be 1 to 3");
    if (!this.plus && id == 3) {
      console.log("servo 3 is only embot+");
      return;
    }
    const target = this.servos[id - 1];
    await this.writeBLE(target, val);
  }
  async buzzer(val = 61) {
    const target = this.buzzer1;
    await this.writeBLE(target, val);
  }
  async readAll() {
    for (let i = 0; i < this.others.length; i++) {
      try {
        const ch = this.others[i];
        const data = await ch.readValue();
        const n = new Uint8Array(data.buffer);
        const value = (n[1] << 8) | n[0];
        console.log(`センサー[${i}] UUID:${ch.uuid}, 値:${value}, RAWデータ:`, Array.from(n));
      } catch (error) {
        console.error(`センサー[${i}]読み取りエラー:`, error);
      }
    }
  }
  async getBrightness() {
    if (!this.f503i) {
      console.log('このデバイスは光センサーに対応していません');
      return {
        raw: [0, 0],
        brightness: 0,
        level: '非対応',
        error: 'このデバイスは光センサーに対応していません'
      };
    }

    try {
      // まず光センサー（e5e4）を取得
      const lightSensor = await this.service.getCharacteristic(uuid("e5e4"));
      console.log('光センサー特性を取得しました');

      // 値を読み取る
      const data = await lightSensor.readValue();
      console.log('光センサーの値を読み取りました');
      const n = new Uint8Array(data.buffer);
      console.log('生データ:', Array.from(n));
      
      // バッファの長さが2バイトであることを確認
      if (n.length !== 2) {
        console.error('不正なデータ長:', n.length, Array.from(n));
        return {
          raw: Array.from(n),
          brightness: 0,
          level: '不正なデータ',
          error: `期待されるバイト長: 2, 実際のバイト長: ${n.length}`
        };
      }

      // 第1バイトが光の強さを示す（0-255）
      const brightness = n[0];
      console.log('光の強さ:', brightness);
      
      // 明るさレベルの判定
      let level;
      if (brightness < 50) level = '非常に暗い';
      else if (brightness < 100) level = '暗い';
      else if (brightness < 150) level = 'やや暗い';
      else if (brightness < 200) level = '明るい';
      else level = '非常に明るい';

      return {
        raw: Array.from(n),    // 生データ [光の強さ, 11]
        brightness: n[0],      // 光の強さ（0-255）
        level,                 // 人間が理解しやすい表現
        error: null           // エラーなし
      };
    } catch (error) {
      console.error('明るさ取得エラー:', error.name, error.message);
      console.error('エラーの詳細:', error);
      return {
        raw: [0, 0],
        brightness: 0,
        level: 'エラー',
        error: `${error.name}: ${error.message}`
      };
    }
  }
  setKeyState(n) {
    this.keystate = n;
    for (const l of this.keylisteners) {
      l(n);
    }
  }
  addKeyEventListener(listener) {
    this.keylisteners.push(listener);
  }
}

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
      /*
        // led
        e515 read writeWithoutResponse
        e516 read writeWithoutResponse
        e517 read writeWithoutResponse
        e518 read writeWithoutResponse
        e51a read writeWithoutResponse // right RED
        e51b read writeWithoutResponse

        // buzzer
        e521 read writeWithoutResponse

        // key status change -> 2byte // big endian #*9876543210 の順、12bit
        e531 notify read

        e532 notify read

        e533 read write

        e5e1 read
        e5e2 read
        e5e3 read
        e5e4 read // ?, light sensor? 2byte
      */
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
      const uuidread = ["e515", "e516", "e533", "e5e1", "e5e2", "e5e3", "e5e4"];
      embot.others = [];
      for (const i of uuidread) {
        const ch = await service.getCharacteristic(uuid(i));
        embot.others.push(ch);
      }
      for (const i of ["e531", "e532"]) {
        const ch = await service.getCharacteristic(uuid(i));
        ch.addEventListener('characteristicvaluechanged', async e => {
          const data = new Uint8Array(e.target.value.buffer);
          const n = (data[1] << 8) | data[0]; // data.length == 2
          // LSMから 0-9*#
          //console.log('recv', i, n.toString(2)); // data.length, data);
          embot.setKeyState(n);
        });
        ch.startNotifications();
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
  async initLightSensor() {
    try {
      // e533をモード2に設定
      const e533 = await this.service.getCharacteristic(uuid("e533"));
      const buf = new Uint8Array(1);
      buf[0] = 2;  // モード2
      await e533.writeValue(buf.buffer);
      console.log('光センサーをモード2に初期化しました');
      return true;
    } catch (error) {
      console.error('光センサー初期化エラー:', error);
      return false;
    }
  }

  async getBrightness() {
    try {
      // 明るさセンサー（e5e4）から直接読み取り
      const data = await this.others[6].readValue();
      const n = new Uint8Array(data.buffer);
      
      // バッファの長さが2バイトであることを確認
      if (n.length !== 2) {
        console.error('不正なデータ長:', n.length, Array.from(n));
        return { raw: [0, 0], brightness: 0, level: '不明' };
      }

      // 第1バイトが光の強さを示す（0-255）
      const brightness = n[0];
      
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
        level                  // 人間が理解しやすい表現
      };
    } catch (error) {
      console.error('明るさ取得エラー:', error);
      return { raw: [0, 0], brightness: 0, level: 'エラー' };
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

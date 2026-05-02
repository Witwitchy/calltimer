/**
 * @name a.CallTimer
 * @author Wiçi
 * @description Add call timer to all users in a server voice channel.
 * @authorLink https://github.com/Witwitchy
 * @version 3.2
 */

module.exports = (_ => {
    class Timer extends window.BdApi.React.Component {
        constructor(props) {
            try {
                super(props);
                this.state = { tick: 0 };
            } catch (e) { }
        }

        render() {
            const elapsed = Date.now() - this.props.time;
            const time = new Date(elapsed).toISOString().substr(11, 8);
            return window.BdApi.React.createElement("div", {
                className: "calltimerCounter",
                style: {
                    fontWeight: "bold",
                    fontSize: 9,
                    position: "absolute",
                    color: "var(--channels-default)",
                    marginTop: 23,
                    marginLeft: 32,
                    pointerEvents: "none",
                    userSelect: "none",
                },
                children: time
            });
        }

        componentDidMount() {
            this.interval = setInterval(() => this.setState(s => ({ tick: s.tick + 1 })), 1000);
        }

        componentWillUnmount() {
            clearInterval(this.interval);
        }
    }

    // ─── Modül & metod bulma yardımcıları ─────────────────────────────────────

    /**
     * Önce tek kaynak string ile dene, bulamazsa kombinasyonları dene.
     * Bulduğu modülü döner, bulamazsa null.
     */
    function findVoiceUserModule() {
        // Doğrudan modül filtresi: avatarContainerClass prop'u içeren Ay fonksiyonu
        // Bu, moduleId 481947'yi hedef alır (Discord güncellemesiyle ID değişse de içerik sabit kalır)
        const byFilter = window.BdApi.Webpack.getModule(
            (m) => m?.Ay && typeof m.Ay === "function" && m.Ay.toString().includes("avatarContainerClass"),
            { searchExports: false }
        );
        if (byFilter) {
            console.log("[CallTimer] VoiceUser modülü filtre ile bulundu.");
            return byFilter;
        }

        // Fallback: eski getBySource yöntemleri
        const attempts = [
            ["avatarContainerClass"],
            ["getAvatarURL"],
            ["g4", "H", "getAvatarURL"],
        ];
        for (const keys of attempts) {
            const mod = window.BdApi.Webpack.getBySource(...keys);
            if (mod && typeof mod?.Ay === "function") {
                console.log("[CallTimer] VoiceUser modülü getBySource ile bulundu:", keys.join("+"));
                return mod;
            }
        }

        console.error("[CallTimer] VoiceUser modülü HİÇ bulunamadı!");
        return null;
    }

    /**
     * Modül içindeki doğru render metodunu bul.
     * Önce bilinen adları dener, bulamazsa JSX döndüren tüm metodları tarar.
     */
    function findRenderMethod(mod) {
        if (!mod) return null;

        // Bilinen obfuscated isimler (Discord güncellemesiyle değişebilir):
        const knownNames = ["Ay", "Z", "render", "default"];

        for (const name of knownNames) {
            if (typeof mod[name] === "function") {
                console.log(`[CallTimer] Metod deneniyor: "${name}"`);
                // İçinde JSX / React.createElement geçiyor mu?
                const src = mod[name].toString();
                if (src.includes("createElement") || src.includes("voiceUser") || src.includes("user")) {
                    console.log(`[CallTimer] Render metodu bulundu: "${name}"`);
                    return name;
                }
            }
        }

        // Fallback: tüm kısa metod isimlerini tara
        const allKeys = Object.keys(mod);
        for (const key of allKeys) {
            if (typeof mod[key] !== "function") continue;
            const src = mod[key].toString();
            // VoiceUser render'ı genelde "user" prop'u ve bir avatar element'i içerir
            if (
                (src.includes("user") || src.includes("avatar")) &&
                src.includes("createElement")
            ) {
                console.log(`[CallTimer] Fallback: render metodu bulundu: "${key}"`);
                return key;
            }
        }

        console.error("[CallTimer] Render metodu bulunamadı. Mevcut metodlar:", allKeys);
        return null;
    }

    // ─── Ana sınıf ────────────────────────────────────────────────────────────

    return class CallTimer {
        users = new Map();  // userId => [channelId, joinTime]

        load() { }

        allUsers(guilds) {
            const users = [];
            for (const guildId in guilds) {
                const guild = guilds[guildId];
                for (const userId in guild) {
                    users.push(userId);
                }
            }
            return users;
        }

        updateInternal(userId, channelId) {
            this.users.set(userId, [channelId, Date.now()]);
        }

        updateSingleUser(userId, channelId) {
            if (!channelId) return;
            const existing = this.users.get(userId);
            if (!existing) {
                this.updateInternal(userId, channelId);
            } else if (existing[0] !== channelId) {
                // Kanal değiştirdi → timer sıfırla
                this.updateInternal(userId, channelId);
            }
        }

        runEverySecond() {
            const states = this.VoiceStateStore.getAllVoiceStates();
            const current_users = this.allUsers(states);

            // Ayrılanları temizle
            for (const userId of Array.from(this.users.keys())) {
                if (!current_users.includes(userId)) {
                    this.users.delete(userId);
                }
            }

            // Yeni kullanıcıları / kanal değişikliklerini kaydet
            for (const guildId in states) {
                const guild = states[guildId];
                for (const userId in guild) {
                    const { channelId } = guild[userId];
                    if (!channelId) continue;
                    const existing = this.users.get(userId);
                    if (!existing) {
                        this.updateInternal(userId, channelId);
                    } else if (existing[0] !== channelId) {
                        this.updateInternal(userId, channelId);
                    }
                }
            }
        }

        start() {
            this.VoiceStateStore = window.BdApi.Webpack.getStore("VoiceStateStore");

            // ── Modülü bul ──
            const VoiceUser = findVoiceUserModule();
            if (!VoiceUser) {
                console.error("[CallTimer] start() iptal: modül yok.");
                return;
            }

            // ── Metodu bul ──
            const methodName = findRenderMethod(VoiceUser);
            if (!methodName) {
                console.error("[CallTimer] start() iptal: metod yok.");
                // Geliştiriciye yardım: tüm metodları logla
                console.log("[CallTimer] Modül içerikleri:", Object.keys(VoiceUser).map(k => ({
                    key: k,
                    type: typeof VoiceUser[k],
                    preview: typeof VoiceUser[k] === "function"
                        ? VoiceUser[k].toString().substring(0, 150)
                        : VoiceUser[k]
                })));
                return;
            }

            console.log(`[CallTimer] Patch başlıyor: VoiceUser["${methodName}"]`);

            window.BdApi.Patcher.after("CallTimer", VoiceUser, methodName, (_, [props], returnValue) => {
                console.log("[CallTimer] ✅ Patcher tetiklendi:", props?.user?.id, props?.user?.username);
                if (!returnValue || !props?.user) return;
                this.processVoiceUser(_, [props], returnValue);
            });

            this.interval = setInterval(() => this.runEverySecond(), 1000);
            console.log("[CallTimer] ✅ Plugin başlatıldı.");
        }

        stop() {
            window.BdApi.Patcher.unpatchAll("CallTimer");
            clearInterval(this.interval);
            console.log("[CallTimer] Plugin durduruldu.");
        }

        createUserTimer(user, parent) {
            const entry = this.users.get(user.id);
            if (!entry) {
                console.warn("[CallTimer] createUserTimer: kullanıcı bulunamadı", user.id);
                return;
            }
            const time = entry[1];
            const tag = window.BdApi.React.createElement(Timer, { time });

            try {
                if (Array.isArray(parent)) {
                    parent.splice(3, 0, tag);
                } else {
                    console.warn("[CallTimer] parent dizi değil:", parent);
                }
            } catch (e) {
                console.error("[CallTimer] createUserTimer splice hatası:", e);
            }
        }

        processVoiceUser(_, [props], returnValue) {
            const { user } = props;
            if (!user?.id) return;

            this.updateSingleUser(user.id, props.channelId);

            try {
                const parent = returnValue.props.children.props.children;
                if (!Array.isArray(parent)) {
                    console.warn("[CallTimer] parent yolu geçersiz, returnValue yapısı:", JSON.stringify(returnValue, null, 2).substring(0, 500));
                    return;
                }
                this.createUserTimer(user, parent);
            } catch (e) {
                console.error("[CallTimer] processVoiceUser hata:", e, "returnValue:", returnValue);
            }
        }
    };
})();

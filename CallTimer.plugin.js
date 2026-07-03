/**
 * @name AllCallTimer
 * @author Witwitchy
 * @authorId 92660365
 * @description Add call timer to all users in a server voice channel.
 * @version 3.4
 * @source https://github.com/Witwitchy/calltimer/blob/main/CallTimer.plugin.js
 * @updateUrl https://raw.githubusercontent.com/Witwitchy/calltimer/refs/heads/main/CallTimer.plugin.js

 */

module.exports = (_ => {

    // ─── DEBUG ────────────────────────────────────────────────────────────────
    let DEBUG = false;
    const log  = (...a) => DEBUG && console.log("[CallTimer]", ...a);
    const warn = (...a) => DEBUG && console.warn("[CallTimer]", ...a);
    const err  = (...a) => DEBUG && console.error("[CallTimer]", ...a);
    // ─────────────────────────────────────────────────────────────────────────

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

    function findVoiceUserModule() {
        const byFilter = window.BdApi.Webpack.getModule(
            (m) => m?.Ay && typeof m.Ay === "function" && m.Ay.toString().includes("avatarContainerClass"),
            { searchExports: false }
        );
        if (byFilter) {
            log("VoiceUser modülü filtre ile bulundu.");
            return byFilter;
        }

        const attempts = [
            ["avatarContainerClass"],
            ["getAvatarURL"],
            ["g4", "H", "getAvatarURL"],
        ];
        for (const keys of attempts) {
            const mod = window.BdApi.Webpack.getBySource(...keys);
            if (mod && typeof mod?.Ay === "function") {
                log("VoiceUser modülü getBySource ile bulundu:", keys.join("+"));
                return mod;
            }
        }

        err("VoiceUser modülü HİÇ bulunamadı!");
        return null;
    }

    function findRenderMethod(mod) {
        if (!mod) return null;

        const knownNames = ["Ay", "Z", "render", "default"];
        for (const name of knownNames) {
            if (typeof mod[name] === "function") {
                log(`Metod deneniyor: "${name}"`);
                const src = mod[name].toString();
                if (src.includes("createElement") || src.includes("voiceUser") || src.includes("user")) {
                    log(`Render metodu bulundu: "${name}"`);
                    return name;
                }
            }
        }

        const allKeys = Object.keys(mod);
        for (const key of allKeys) {
            if (typeof mod[key] !== "function") continue;
            const src = mod[key].toString();
            if ((src.includes("user") || src.includes("avatar")) && src.includes("createElement")) {
                log(`Fallback: render metodu bulundu: "${key}"`);
                return key;
            }
        }

        err("Render metodu bulunamadı. Mevcut metodlar:", allKeys);
        return null;
    }

    return class CallTimer {
        users = new Map();  // userId => [channelId, joinTime]

        load() { }

        // ─── Ayarlar Paneli ───────────────────────────────────────────────────
        getSettingsPanel() {
            const panel = document.createElement("div");
            panel.style.cssText = "padding: 16px; color: var(--header-primary); font-family: var(--font-primary);";

            // Başlık
            const title = document.createElement("div");
            title.textContent = "Debug";
            title.style.cssText = "font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--header-secondary); margin-bottom: 12px; letter-spacing: 0.5px;";
            panel.appendChild(title);

            // Satır
            const row = document.createElement("div");
            row.style.cssText = "display: flex; align-items: center; justify-content: space-between; background: var(--background-secondary); border-radius: 8px; padding: 12px 16px;";

            // Sol: etiket + açıklama
            const left = document.createElement("div");

            const label = document.createElement("div");
            label.textContent = "Debug Modu";
            label.style.cssText = "font-size: 16px; font-weight: 500;";

            const desc = document.createElement("div");
            desc.textContent = "Console'da tüm logları göster";
            desc.style.cssText = "font-size: 12px; color: var(--text-muted); margin-top: 2px;";

            left.appendChild(label);
            left.appendChild(desc);

            // Sağ: toggle
            const toggle = document.createElement("div");
            const updateToggle = () => {
                toggle.style.cssText = `
                    width: 40px; height: 24px; border-radius: 12px; cursor: pointer;
                    background: ${DEBUG ? "var(--brand-experiment)" : "var(--background-tertiary)"};
                    position: relative; transition: background 0.2s; flex-shrink: 0;
                `;
                knob.style.cssText = `
                    width: 18px; height: 18px; border-radius: 50%; background: white;
                    position: absolute; top: 3px; transition: left 0.2s;
                    left: ${DEBUG ? "19px" : "3px"};
                `;
            };

            const knob = document.createElement("div");
            toggle.appendChild(knob);
            updateToggle();

            toggle.addEventListener("click", () => {
                DEBUG = !DEBUG;
                updateToggle();
                console.log(`[CallTimer] Debug modu: ${DEBUG ? "AÇIK ✅" : "KAPALI ❌"}`);
            });

            row.appendChild(left);
            row.appendChild(toggle);
            panel.appendChild(row);

            return panel;
        }
        // ─────────────────────────────────────────────────────────────────────

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
                this.updateInternal(userId, channelId);
            }
        }

        runEverySecond() {
            const states = this.VoiceStateStore.getAllVoiceStates();
            const current_users = this.allUsers(states);

            for (const userId of Array.from(this.users.keys())) {
                if (!current_users.includes(userId)) {
                    this.users.delete(userId);
                }
            }

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

			const attemptPatch = () => {

				const VoiceUser = findVoiceUserModule();

				if (!VoiceUser) {
					log("VoiceUser bulunamadı. 1 saniye sonra tekrar denenecek...");
					this.retryTimeout = setTimeout(attemptPatch, 1000);
					return;
				}

				const methodName = findRenderMethod(VoiceUser);

				if (!methodName) {
					log("Render metodu bulunamadı. 1 saniye sonra tekrar denenecek...");
					this.retryTimeout = setTimeout(attemptPatch, 1000);
					return;
				}

				log(`Patch başlıyor: VoiceUser["${methodName}"]`);

				window.BdApi.Patcher.after(
					"CallTimer",
					VoiceUser,
					methodName,
					(_, [props], returnValue) => {

						log("✅ Patcher tetiklendi:", props?.user?.id, props?.user?.username);

						if (!returnValue || !props?.user) return;

						this.processVoiceUser(_, [props], returnValue);
					}
				);

				this.interval = setInterval(() => this.runEverySecond(), 1000);

				log("✅ Plugin başlatıldı.");
			};

			attemptPatch();
		}
        stop() {
            window.BdApi.Patcher.unpatchAll("CallTimer");
			
            clearInterval(this.interval);
			clearTimeout(this.retryTimeout);
			
            log("Plugin durduruldu.");
        }

        createUserTimer(user, parent) {
            const entry = this.users.get(user.id);
            if (!entry) {
                warn("createUserTimer: kullanıcı bulunamadı", user.id);
                return;
            }
            const time = entry[1];
            const tag = window.BdApi.React.createElement(Timer, { time });

            try {
                if (Array.isArray(parent)) {
                    parent.splice(3, 0, tag);
                } else {
                    warn("parent dizi değil:", parent);
                }
            } catch (e) {
                err("createUserTimer splice hatası:", e);
            }
        }

        processVoiceUser(_, [props], returnValue) {
            const { user } = props;
            if (!user?.id) return;

            this.updateSingleUser(user.id, props.channelId);

            try {
                const parent = returnValue.props.children.props.children;
                if (!Array.isArray(parent)) {
                    warn("parent yolu geçersiz, returnValue yapısı:", JSON.stringify(returnValue, null, 2).substring(0, 500));
                    return;
                }
                this.createUserTimer(user, parent);
            } catch (e) {
                err("processVoiceUser hata:", e, "returnValue:", returnValue);
            }
        }
    };
})();

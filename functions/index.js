/**
 *  * FinTrack — Cloud Function de notificação de contas vencendo.
  *
   * Roda 1x por dia (08:00, horário de Brasília) e, pra cada usuário:
    *  - carrega as contas dele (mesma lógica de "vencendo hoje / em até 3 dias" do app)
     *  - manda push via Firebase Cloud Messaging pros tokens registrados
      *  - evita duplicar (guarda quais notificações já foram enviadas em
       *    users/{uid}/notifiedBills/{notifKey})
        *  - some tokens inválidos/expirados automaticamente
         *
          * Deploy: dentro da pasta do projeto, rodar `firebase deploy --only functions`.
           */

           const { onSchedule } = require("firebase-functions/v2/scheduler");
           const { initializeApp } = require("firebase-admin/app");
           const { getFirestore, FieldValue } = require("firebase-admin/firestore");
           const { getMessaging } = require("firebase-admin/messaging");

           // Inicialização "preguiçosa": só conecta no Firebase quando a function
           // realmente roda. Isso permite importar este arquivo nos testes sem
           // precisar de credenciais nem de rede.
           let db, messaging;
           function ensureInit() {
             if (!db) {
                 initializeApp();
                     db = getFirestore();
                         messaging = getMessaging();
                           }
                           }

                           function pad(n) {
                             return String(n).padStart(2, "0");
                             }
                             function billYm(y, m) {
                               return `${y}-${pad(m + 1)}`;
                               }
                               function fmtCurrency(v) {
                                 return "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                 }

                                 // Mesma regra do app: uma conta recorrente só vale a partir do mês em que foi criada
                                 // e, se configurado, até o mês final.
                                 function isRecurringActiveForYm(bill, ym) {
                                   const startYm = billYm(bill.refYear, bill.refMonth);
                                     if (ym < startYm) return false;
                                       if (bill.recurringEnd && ym > bill.recurringEnd) return false;
                                         return true;
                                         }

                                         // Diferença em dias entre duas datas "YYYY-MM-DD", calculada em UTC
                                         // pra não sofrer com fuso horário do servidor.
                                         function daysBetween(fromStr, toStr) {
                                           const [fy, fm, fd] = fromStr.split("-").map(Number);
                                             const [ty, tm, td] = toStr.split("-").map(Number);
                                               const fromUTC = Date.UTC(fy, fm - 1, fd);
                                                 const toUTC = Date.UTC(ty, tm - 1, td);
                                                   return Math.round((toUTC - fromUTC) / 86400000);
                                                   }

                                                   /**
                                                    * Decide se uma conta deve gerar notificação hoje, e monta o texto.
                                                     * Função pura (sem Firestore/Messaging) — fácil de testar isoladamente.
                                                      *
                                                       * @param {string} billId
                                                        * @param {object} b - dados da conta
                                                         * @param {{todayStr:string,in3Str:string,payKey:string,m:number,y:number}} ctx
                                                          * @returns {{notifKey:string,title:string,body:string}|null}
                                                           */
                                                           function buildNotificationForBill(billId, b, ctx) {
                                                             const { todayStr, in3Str, payKey, m, y } = ctx;

                                                               if (!b.dueDay) return null;
                                                                 if (b.isRecurring && !isRecurringActiveForYm(b, payKey)) return null;
                                                                   if (!b.isRecurring && (b.refMonth !== m || b.refYear !== y)) return null;

                                                                     const isPaid = b.isRecurring ? !!((b.payments || {})[payKey]) : !!b.paid;
                                                                       if (isPaid) return null;

                                                                         // Guarda contra dueDay inválido pro mês atual (ex: 31 em fevereiro).
                                                                           // new Date "rola" pro mês seguinte nesse caso — detectamos comparando o mês de volta.
                                                                             const dueDateCheck = new Date(y, m, b.dueDay);
                                                                               if (dueDateCheck.getMonth() !== m) return null;

                                                                                 const dueStr = `${y}-${pad(m + 1)}-${pad(b.dueDay)}`;
                                                                                   const notifKey = `${billId}_${dueStr}`;

                                                                                     let title = "";
                                                                                       let body = "";
                                                                                         if (dueStr === todayStr) {
                                                                                             title = "⚠️ Conta vence HOJE!";
                                                                                                 body = `${b.name} — ${fmtCurrency(b.value)} vence hoje. Não esqueça de pagar!`;
                                                                                                   } else if (dueStr > todayStr && dueStr <= in3Str) {
                                                                                                       const diff = daysBetween(todayStr, dueStr);
                                                                                                           title = `📋 Conta vence em ${diff} dia${diff > 1 ? "s" : ""}`;
                                                                                                               body = `${b.name} — ${fmtCurrency(b.value)} vence dia ${b.dueDay}.`;
                                                                                                                 } else {
                                                                                                                     return null; // não está vencendo em breve
                                                                                                                       }

                                                                                                                         return { notifKey, title, body };
                                                                                                                         }

                                                                                                                         exports.checkBillsDueDaily = onSchedule(
                                                                                                                           {
                                                                                                                               schedule: "0 8 * * *",
                                                                                                                                   timeZone: "America/Sao_Paulo",
                                                                                                                                       region: "southamerica-east1",
                                                                                                                                         },
                                                                                                                                           async () => {
                                                                                                                                               ensureInit();

                                                                                                                                                   const now = new Date();
                                                                                                                                                       const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                                                                                                                                                           const in3 = new Date(now);
                                                                                                                                                               in3.setDate(in3.getDate() + 3);
                                                                                                                                                                   const in3Str = `${in3.getFullYear()}-${pad(in3.getMonth() + 1)}-${pad(in3.getDate())}`;
                                                                                                                                                                       const m = now.getMonth();
                                                                                                                                                                           const y = now.getFullYear();
                                                                                                                                                                               const payKey = billYm(y, m);
                                                                                                                                                                                   const ctx = { todayStr, in3Str, payKey, m, y };

                                                                                                                                                                                       const usersSnap = await db.collection("users").get();

                                                                                                                                                                                           for (const userDoc of usersSnap.docs) {
                                                                                                                                                                                                 const uid = userDoc.id;
                                                                                                                                                                                                       const tokens = userDoc.data().fcmTokens || [];
                                                                                                                                                                                                             if (!tokens.length) continue; // usuário nunca ativou notificação nesse dispositivo

                                                                                                                                                                                                                   const [billsSnap, notifiedSnap] = await Promise.all([
                                                                                                                                                                                                                           db.collection("users").doc(uid).collection("bills").get(),
                                                                                                                                                                                                                                   db.collection("users").doc(uid).collection("notifiedBills").get(),
                                                                                                                                                                                                                                         ]);
                                                                                                                                                                                                                                               const alreadyNotified = new Set(notifiedSnap.docs.map((d) => d.id));

                                                                                                                                                                                                                                                     const toSend = [];
                                                                                                                                                                                                                                                           billsSnap.docs.forEach((billDoc) => {
                                                                                                                                                                                                                                                                   const item = buildNotificationForBill(billDoc.id, billDoc.data(), ctx);
                                                                                                                                                                                                                                                                           if (item && !alreadyNotified.has(item.notifKey)) toSend.push(item);
                                                                                                                                                                                                                                                                                 });

                                                                                                                                                                                                                                                                                       for (const item of toSend) {
                                                                                                                                                                                                                                                                                               try {
                                                                                                                                                                                                                                                                                                         const resp = await messaging.sendEachForMulticast({
                                                                                                                                                                                                                                                                                                                     tokens,
                                                                                                                                                                                                                                                                                                                                 notification: { title: item.title, body: item.body },
                                                                                                                                                                                                                                                                                                                                             data: { tag: item.notifKey },
                                                                                                                                                                                                                                                                                                                                                       });

                                                                                                                                                                                                                                                                                                                                                                 // Remove tokens inválidos/expirados (ex: usuário desinstalou, trocou de navegador)
                                                                                                                                                                                                                                                                                                                                                                           const invalidTokens = [];
                                                                                                                                                                                                                                                                                                                                                                                     resp.responses.forEach((r, i) => {
                                                                                                                                                                                                                                                                                                                                                                                                 const code = r.error && r.error.code;
                                                                                                                                                                                                                                                                                                                                                                                                             if (!r.success && (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument")) {
                                                                                                                                                                                                                                                                                                                                                                                                                           invalidTokens.push(tokens[i]);
                                                                                                                                                                                                                                                                                                                                                                                                                                       }
                                                                                                                                                                                                                                                                                                                                                                                                                                                 });
                                                                                                                                                                                                                                                                                                                                                                                                                                                           if (invalidTokens.length) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                       await db.collection("users").doc(uid).update({
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     fcmTokens: FieldValue.arrayRemove(...invalidTokens),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 });
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           }

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     await db
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 .collection("users")
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             .doc(uid)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         .collection("notifiedBills")
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     .doc(item.notifKey)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 .set({ sentAt: new Date().toISOString() });
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         } catch (e) {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   console.error(`Erro ao notificar usuário ${uid} (${item.notifKey}):`, e);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       );

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       // Exportado só para os testes (não afeta o deploy nem o comportamento em produção).
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       exports._internal = { pad, billYm, fmtCurrency, isRecurringActiveForYm, daysBetween, buildNotificationForBill };
 
// ── LEMBRETE DE ATUALIZAÇÃO DE INVESTIMENTOS ──
// Roda todo dia às 08:00 (mesmo horário da de contas), mas só age nos dias 1 e 15 de cada mês,
// e só para usuários que têm pelo menos um investimento ativo cadastrado.
const INVESTMENT_REMINDER_DAYS = [1, 15];

exports.checkInvestmentReminderDaily = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
  },
  async () => {
    ensureInit();

    const now = new Date();
    const todayDay = now.getDate();
    if (!INVESTMENT_REMINDER_DAYS.includes(todayDay)) return; // não é dia de lembrete

    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(todayDay)}`;
    const notifKey = `invreminder_${todayStr}`;

    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const tokens = userDoc.data().fcmTokens || [];
      if (!tokens.length) continue; // usuário nunca ativou notificação nesse dispositivo

      try {
        const [investmentsSnap, notifiedDoc] = await Promise.all([
          db.collection("users").doc(uid).collection("investments").get(),
          db.collection("users").doc(uid).collection("notifiedBills").doc(notifKey).get(),
        ]);
        if (investmentsSnap.empty) continue; // só notifica quem tem investimento cadastrado
        if (notifiedDoc.exists) continue; // já notificado hoje (evita duplicar)

        // Só considera investimentos ainda ativos (valor atual > 0)
        const hasActive = investmentsSnap.docs.some((d) => {
          const v = d.data();
          const cur = v.valueCurrent ?? v.valueInvested ?? 0;
          return cur > 0.005;
        });
        if (!hasActive) continue;

        const resp = await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: "📈 Hora de atualizar seus investimentos!",
            body: "Já faz um tempo — dá uma olhada nos seus investimentos e atualiza o valor atual de cada um.",
          },
          data: { tag: notifKey },
        });

        const invalidTokens = [];
        resp.responses.forEach((r, i) => {
          const code = r.error && r.error.code;
          if (!r.success && (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument")) {
            invalidTokens.push(tokens[i]);
          }
        });
        if (invalidTokens.length) {
          await db.collection("users").doc(uid).update({
            fcmTokens: FieldValue.arrayRemove(...invalidTokens),
          });
        }

        await db.collection("users").doc(uid).collection("notifiedBills").doc(notifKey).set({ sentAt: new Date().toISOString() });
      } catch (e) {
        console.error(`Erro ao notificar investimentos do usuário ${uid}:`, e);
      }
    }
  }
);

// ── ESTATÍSTICAS DE USO (só o dev pode chamar) ──
// Callable function: roda no servidor com Admin SDK (ignora as regras do Firestore),
// mas SÓ retorna números agregados — nunca dados individuais de usuários (nome, email,
// lançamentos específicos etc). A checagem de quem é o dev acontece aqui no servidor,
// nunca confiando no que o cliente diz que é.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const DEV_UID = "EUgFCLnrh3YAWpjV6d1j1uzvl7M2";

exports.getDevStats = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    ensureInit();
    if (!request.auth || request.auth.uid !== DEV_UID) {
      throw new HttpsError("permission-denied", "Só o dev pode acessar essas estatísticas.");
    }

    const usersSnap = await db.collection("users").get();
    const totalUsers = usersSnap.size;

    const themeCount = { light: 0, dark: 0, indefinido: 0 };
    let usersWithPushEnabled = 0;
    usersSnap.forEach((d) => {
      const cfg = d.data().config || {};
      const theme = cfg.theme === "light" ? "light" : cfg.theme === "dark" ? "dark" : "indefinido";
      themeCount[theme]++;
      if ((d.data().fcmTokens || []).length) usersWithPushEnabled++;
    });

    // count() é uma agregação eficiente do Firestore — não baixa os documentos, só conta.
    const [txCount, billsCount, invCount, loansCount] = await Promise.all([
      db.collectionGroup("transactions").count().get(),
      db.collectionGroup("bills").count().get(),
      db.collectionGroup("investments").count().get(),
      db.collectionGroup("loans").count().get(),
    ]);

    return {
      totalUsers,
      usersWithPushEnabled,
      themeCount,
      totalTransactions: txCount.data().count,
      totalBills: billsCount.data().count,
      totalInvestments: invCount.data().count,
      totalLoans: loansCount.data().count,
      generatedAt: new Date().toISOString(),
    };
  }
);

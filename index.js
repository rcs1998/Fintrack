/**
 * FinTrack — Cloud Function de notificação de contas vencendo.
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

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

function pad(n) { return String(n).padStart(2, "0"); }
function billYm(y, m) { return `${y}-${pad(m + 1)}`; }
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

exports.checkBillsDueDaily = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
  },
  async () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const in3 = new Date(now);
    in3.setDate(in3.getDate() + 3);
    const in3Str = `${in3.getFullYear()}-${pad(in3.getMonth() + 1)}-${pad(in3.getDate())}`;
    const m = now.getMonth(), y = now.getFullYear();
    const payKey = billYm(y, m);

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
        const b = billDoc.data();
        if (!b.dueDay) return;
        if (b.isRecurring && !isRecurringActiveForYm(b, payKey)) return;
        if (!b.isRecurring && (b.refMonth !== m || b.refYear !== y)) return;

        const isPaid = b.isRecurring ? !!((b.payments || {})[payKey]) : !!b.paid;
        if (isPaid) return;

        const dueStr = `${y}-${pad(m + 1)}-${pad(b.dueDay)}`;
        const notifKey = `${billDoc.id}_${dueStr}`;
        if (alreadyNotified.has(notifKey)) return;

        let title = "", body = "";
        if (dueStr === todayStr) {
          title = "⚠️ Conta vence HOJE!";
          body = `${b.name} — ${fmtCurrency(b.value)} vence hoje. Não esqueça de pagar!`;
        } else if (dueStr > todayStr && dueStr <= in3Str) {
          const diff = Math.round((new Date(dueStr) - now) / 86400000);
          title = `📋 Conta vence em ${diff} dia${diff > 1 ? "s" : ""}`;
          body = `${b.name} — ${fmtCurrency(b.value)} vence dia ${b.dueDay}.`;
        } else {
          return; // não está vencendo em breve
        }

        toSend.push({ notifKey, title, body });
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

          await db.collection("users").doc(uid).collection("notifiedBills").doc(item.notifKey).set({
            sentAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error(`Erro ao notificar usuário ${uid} (${item.notifKey}):`, e);
        }
      }
    }
  }
);

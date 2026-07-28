const { _internal } = require("./index");
const { pad, billYm, fmtCurrency, isRecurringActiveForYm, daysBetween, buildNotificationForBill } = _internal;

describe("pad", () => {
  test("adiciona zero à esquerda em números de 1 dígito", () => {
      expect(pad(5)).toBe("05");
        });
          test("mantém números de 2 dígitos como estão", () => {
              expect(pad(12)).toBe("12");
                });
                });

                describe("billYm", () => {
                  test("monta a chave ano-mês com mês em base 0 (formato JS Date)", () => {
                      // Janeiro = mês 0 no JS Date
                          expect(billYm(2026, 0)).toBe("2026-01");
                              expect(billYm(2026, 11)).toBe("2026-12");
                                });
                                });

                                describe("fmtCurrency", () => {
                                  test("formata valor positivo em Real", () => {
                                      expect(fmtCurrency(1234.5)).toBe("R$ 1.234,50");
                                        });
                                          test("trata undefined/null como zero", () => {
                                              expect(fmtCurrency(undefined)).toBe("R$ 0,00");
                                                  expect(fmtCurrency(null)).toBe("R$ 0,00");
                                                    });
                                                    });

                                                    describe("isRecurringActiveForYm", () => {
                                                      test("conta recorrente é ativa no mês de criação", () => {
                                                          const bill = { refYear: 2026, refMonth: 5 }; // junho/2026
                                                              expect(isRecurringActiveForYm(bill, "2026-06")).toBe(true);
                                                                });

                                                                  test("conta recorrente NÃO é ativa antes do mês de criação", () => {
                                                                      const bill = { refYear: 2026, refMonth: 5 }; // criada em junho/2026
                                                                          expect(isRecurringActiveForYm(bill, "2026-05")).toBe(false);
                                                                            });

                                                                              test("conta recorrente com recurringEnd para de valer depois desse mês", () => {
                                                                                  const bill = { refYear: 2026, refMonth: 0, recurringEnd: "2026-06" };
                                                                                      expect(isRecurringActiveForYm(bill, "2026-06")).toBe(true);
                                                                                          expect(isRecurringActiveForYm(bill, "2026-07")).toBe(false);
                                                                                            });
                                                                                            });

                                                                                            describe("daysBetween", () => {
                                                                                              test("calcula diferença correta em dias, sem sofrer com fuso horário", () => {
                                                                                                  expect(daysBetween("2026-07-27", "2026-07-30")).toBe(3);
                                                                                                      expect(daysBetween("2026-07-27", "2026-07-27")).toBe(0);
                                                                                                        });
                                                                                                        });

                                                                                                        describe("buildNotificationForBill", () => {
                                                                                                          const ctx = {
                                                                                                              todayStr: "2026-07-27",
                                                                                                                  in3Str: "2026-07-30",
                                                                                                                      payKey: "2026-07",
                                                                                                                          m: 6, // julho = índice 6
                                                                                                                              y: 2026,
                                                                                                                                };

                                                                                                                                  test("conta não recorrente vencendo hoje gera notificação de HOJE", () => {
                                                                                                                                      const bill = { name: "Aluguel", value: 1500, dueDay: 27, refMonth: 6, refYear: 2026, paid: false };
                                                                                                                                          const result = buildNotificationForBill("bill1", bill, ctx);
                                                                                                                                              expect(result).not.toBeNull();
                                                                                                                                                  expect(result.title).toBe("⚠️ Conta vence HOJE!");
                                                                                                                                                      expect(result.notifKey).toBe("bill1_2026-07-27");
                                                                                                                                                        });

                                                                                                                                                          test("conta vencendo em 2 dias gera notificação de contagem regressiva", () => {
                                                                                                                                                              const bill = { name: "Internet", value: 100, dueDay: 29, refMonth: 6, refYear: 2026, paid: false };
                                                                                                                                                                  const result = buildNotificationForBill("bill2", bill, ctx);
                                                                                                                                                                      expect(result).not.toBeNull();
                                                                                                                                                                          expect(result.title).toBe("📋 Conta vence em 2 dias");
                                                                                                                                                                            });

                                                                                                                                                                              test("conta já paga não gera notificação", () => {
                                                                                                                                                                                  const bill = { name: "Água", value: 80, dueDay: 28, refMonth: 6, refYear: 2026, paid: true };
                                                                                                                                                                                      expect(buildNotificationForBill("bill3", bill, ctx)).toBeNull();
                                                                                                                                                                                        });

                                                                                                                                                                                          test("conta vencendo fora da janela de 3 dias não gera notificação", () => {
                                                                                                                                                                                              const bill = { name: "Cartão", value: 500, dueDay: 15, refMonth: 6, refYear: 2026, paid: false };
                                                                                                                                                                                                  expect(buildNotificationForBill("bill4", bill, ctx)).toBeNull();
                                                                                                                                                                                                    });

                                                                                                                                                                                                      test("conta recorrente paga no mês atual não gera notificação", () => {
                                                                                                                                                                                                          const bill = {
                                                                                                                                                                                                                name: "Streaming",
                                                                                                                                                                                                                      value: 40,
                                                                                                                                                                                                                            dueDay: 27,
                                                                                                                                                                                                                                  isRecurring: true,
                                                                                                                                                                                                                                        refMonth: 0,
                                                                                                                                                                                                                                              refYear: 2026,
                                                                                                                                                                                                                                                    payments: { "2026-07": true },
                                                                                                                                                                                                                                                        };
                                                                                                                                                                                                                                                            expect(buildNotificationForBill("bill5", bill, ctx)).toBeNull();
                                                                                                                                                                                                                                                              });

                                                                                                                                                                                                                                                                test("conta recorrente não paga no mês atual gera notificação", () => {
                                                                                                                                                                                                                                                                    const bill = {
                                                                                                                                                                                                                                                                          name: "Streaming",
                                                                                                                                                                                                                                                                                value: 40,
                                                                                                                                                                                                                                                                                      dueDay: 27,
                                                                                                                                                                                                                                                                                            isRecurring: true,
                                                                                                                                                                                                                                                                                                  refMonth: 0,
                                                                                                                                                                                                                                                                                                        refYear: 2026,
                                                                                                                                                                                                                                                                                                              payments: {},
                                                                                                                                                                                                                                                                                                                  };
                                                                                                                                                                                                                                                                                                                      const result = buildNotificationForBill("bill6", bill, ctx);
                                                                                                                                                                                                                                                                                                                          expect(result).not.toBeNull();
                                                                                                                                                                                                                                                                                                                            });

                                                                                                                                                                                                                                                                                                                              test("conta recorrente fora do período (antes do mês de criação) não notifica", () => {
                                                                                                                                                                                                                                                                                                                                  const bill = {
                                                                                                                                                                                                                                                                                                                                        name: "Academia",
                                                                                                                                                                                                                                                                                                                                              value: 90,
                                                                                                                                                                                                                                                                                                                                                    dueDay: 27,
                                                                                                                                                                                                                                                                                                                                                          isRecurring: true,
                                                                                                                                                                                                                                                                                                                                                                refMonth: 7, // criada em agosto/2026, mês depois do contexto (julho)
                                                                                                                                                                                                                                                                                                                                                                      refYear: 2026,
                                                                                                                                                                                                                                                                                                                                                                          };
                                                                                                                                                                                                                                                                                                                                                                              expect(buildNotificationForBill("bill7", bill, ctx)).toBeNull();
                                                                                                                                                                                                                                                                                                                                                                                });

                                                                                                                                                                                                                                                                                                                                                                                  // Regressão do bug: dueDay=31 em mês sem esse dia não deve quebrar nem notificar
                                                                                                                                                                                                                                                                                                                                                                                    test("dueDay=31 em mês com só 30 dias (ex: contexto de abril) não gera notificação nem erro", () => {
                                                                                                                                                                                                                                                                                                                                                                                        const abrilCtx = { todayStr: "2026-04-27", in3Str: "2026-04-30", payKey: "2026-04", m: 3, y: 2026 };
                                                                                                                                                                                                                                                                                                                                                                                            const bill = { name: "Assinatura", value: 20, dueDay: 31, refMonth: 3, refYear: 2026, paid: false };
                                                                                                                                                                                                                                                                                                                                                                                                expect(() => buildNotificationForBill("bill8", bill, abrilCtx)).not.toThrow();
                                                                                                                                                                                                                                                                                                                                                                                                    expect(buildNotificationForBill("bill8", bill, abrilCtx)).toBeNull();
                                                                                                                                                                                                                                                                                                                                                                                                      });

                                                                                                                                                                                                                                                                                                                                                                                                        test("conta sem dueDay é ignorada", () => {
                                                                                                                                                                                                                                                                                                                                                                                                            const bill = { name: "Sem data", value: 10, refMonth: 6, refYear: 2026 };
                                                                                                                                                                                                                                                                                                                                                                                                                expect(buildNotificationForBill("bill9", bill, ctx)).toBeNull();
                                                                                                                                                                                                                                                                                                                                                                                                                  });
                                                                                                                                                                                                                                                                                                                                                                                                                  });
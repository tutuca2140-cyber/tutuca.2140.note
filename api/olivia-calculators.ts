export type OliviaCalculation = {
  category: "financial_math" | "physics";
  topic: string;
  reply: string;
  result: Record<string, number | string>;
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const parsePtNumber = (raw: string) => {
  const value = raw.replace(/\s/g, "");
  if (value.includes(",")) return Number(value.replace(/\./g, "").replace(",", "."));
  const dots = (value.match(/\./g) || []).length;
  if (dots > 1 || /\d\.\d{3}(?:\D|$)/.test(`${value} `)) return Number(value.replace(/\./g, ""));
  return Number(value);
};

const firstMoney = (text: string, occurrence = 0) => {
  const matches = [
    ...text.matchAll(/R\$\s*(-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)/gi),
  ];
  const raw = matches[occurrence]?.[1];
  return raw ? parsePtNumber(raw) : null;
};

const percent = (text: string) => {
  const raw = text.match(/(-?\d+(?:[.,]\d+)?)\s*%/)?.[1];
  return raw ? parsePtNumber(raw) / 100 : null;
};

const integerNear = (text: string, words: string[]) => {
  for (const word of words) {
    const regex = new RegExp(`(\\d+)\\s*${word}`, "i");
    const found = text.match(regex)?.[1];
    if (found) return Number(found);
  }
  return null;
};

const fmt = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const rateLabel = (rate: number) =>
  `${fmt(rate * 100, 4).replace(/0+$/, "").replace(/,$/, "")}%`;

function ratePeriods(text: string) {
  const normalized = normalize(text);
  const duration =
    integerNear(normalized, [
      "mes(?:es)?",
      "ano(?:s)?",
      "dia(?:s)?",
      "semana(?:s)?",
      "parcela(?:s)?",
    ]) ?? null;
  if (!duration) return null;

  const durationUnit = /\d+\s*ano/.test(normalized)
    ? "year"
    : /\d+\s*dia/.test(normalized)
      ? "day"
      : /\d+\s*semana/.test(normalized)
        ? "week"
        : "month";
  const rateUnit = /%[^\n,.]{0,20}(?:ao|a)\s*ano/.test(normalized)
    ? "year"
    : /%[^\n,.]{0,20}(?:ao|a)\s*dia/.test(normalized)
      ? "day"
      : /%[^\n,.]{0,20}(?:por|a)\s*semana/.test(normalized)
        ? "week"
        : "month";

  const days = { day: 1, week: 7, month: 30, year: 360 } as const;
  const n = (duration * days[durationUnit]) / days[rateUnit];
  return { duration, durationUnit, rateUnit, n };
}

function financial(text: string): OliviaCalculation | null {
  const nrm = normalize(text);
  const rate = percent(text);

  if (
    /taxa.*equival|equivale.*taxa|equivale.*%|taxa efetiva/.test(nrm) &&
    rate !== null
  ) {
    const monthlyToAnnual = /(ao|a) mes/.test(nrm) && /(ao|a) ano/.test(nrm);
    const annualToMonthly =
      /(ao|a) ano/.test(nrm) &&
      /(ao|a) mes/.test(nrm) &&
      nrm.indexOf("ano") < nrm.lastIndexOf("mes");
    if (monthlyToAnnual && !annualToMonthly) {
      const equivalent = Math.pow(1 + rate, 12) - 1;
      return {
        category: "financial_math",
        topic: "equivalent_rate",
        reply: `Taxa efetiva equivalente: **${fmt(equivalent * 100, 4)}% ao ano**.\nFórmula: (1 + i_m)^12 - 1 = (1 + ${fmt(rate, 4)})^12 - 1.`,
        result: { annualRate: equivalent },
      };
    }
    if (annualToMonthly) {
      const equivalent = Math.pow(1 + rate, 1 / 12) - 1;
      return {
        category: "financial_math",
        topic: "equivalent_rate",
        reply: `Taxa efetiva equivalente: **${fmt(equivalent * 100, 4)}% ao mês**.\nFórmula: (1 + i_a)^(1/12) - 1.`,
        result: { monthlyRate: equivalent },
      };
    }
  }

  if (/\b(vpl|valor presente liquido)\b/.test(nrm) && rate !== null) {
    const initial = firstMoney(text, 0);
    const flow = firstMoney(text, 1);
    const periods = integerNear(nrm, ["ano(?:s)?", "periodo(?:s)?"]);
    if (initial !== null && flow !== null && periods) {
      let pvFlows = 0;
      for (let t = 1; t <= periods; t += 1) {
        pvFlows += flow / Math.pow(1 + rate, t);
      }
      const npv = -initial + pvFlows;
      return {
        category: "financial_math",
        topic: "npv",
        reply: `VPL = **${brl(npv)}**.\nFórmula: VPL = -I₀ + Σ FCₜ/(1+k)^t.\nCom I₀=${brl(initial)}, FC=${brl(flow)} por ${periods} períodos e k=${rateLabel(rate)}, o valor presente das entradas é ${brl(pvFlows)}.`,
        result: { npv, presentValueInflows: pvFlows },
      };
    }
  }

  if (/\b(price|sistema price|prestacao|prestação)\b/.test(nrm) && rate !== null) {
    const principal = firstMoney(text, 0);
    const periods = integerNear(nrm, ["parcela(?:s)?", "mes(?:es)?"]);
    if (principal !== null && periods) {
      const factor = Math.pow(1 + rate, periods);
      const payment = (principal * rate * factor) / (factor - 1);
      return {
        category: "financial_math",
        topic: "price_payment",
        reply: `Prestação pelo sistema Price: **${brl(payment)} por mês**.\nFórmula: PMT = PV × [i(1+i)^n]/[(1+i)^n−1].\nPV=${brl(principal)}, i=${rateLabel(rate)} ao mês, n=${periods}.`,
        result: { payment, principal, periods, rate },
      };
    }
  }

  if (/valor presente|\bvp\b/.test(nrm) && rate !== null) {
    const futureValue = firstMoney(text, 0);
    const periods = ratePeriods(text);
    if (futureValue !== null && periods) {
      const presentValue = futureValue / Math.pow(1 + rate, periods.n);
      return {
        category: "financial_math",
        topic: "present_value",
        reply: `Valor presente: **${brl(presentValue)}**.\nFórmula: VP = VF/(1+i)^n = ${brl(futureValue)}/(1+${fmt(rate, 4)})^${fmt(periods.n, 4)}.`,
        result: { presentValue, futureValue, rate, periods: periods.n },
      };
    }
  }

  if (/juros compost|valor futuro|montante compost/.test(nrm) && rate !== null) {
    const principal = firstMoney(text, 0);
    const periods = ratePeriods(text);
    if (principal !== null && periods) {
      const amount = principal * Math.pow(1 + rate, periods.n);
      const interest = amount - principal;
      return {
        category: "financial_math",
        topic: "compound_interest",
        reply: `Montante em juros compostos: **${brl(amount)}**. Juros acumulados: **${brl(interest)}**.\nFórmula: M = C(1+i)^n = ${brl(principal)} × (1+${fmt(rate, 4)})^${fmt(periods.n, 4)}.`,
        result: { amount, interest, principal, rate, periods: periods.n },
      };
    }
  }

  if (/juros simples/.test(nrm) && rate !== null) {
    const principal = firstMoney(text, 0);
    const periods = ratePeriods(text);
    if (principal !== null && periods) {
      const interest = principal * rate * periods.n;
      const amount = principal + interest;
      return {
        category: "financial_math",
        topic: "simple_interest",
        reply: `Juros simples: **${brl(interest)}**. Montante: **${brl(amount)}**.\nFórmulas: J = C × i × n; M = C + J.`,
        result: { interest, amount, principal, rate, periods: periods.n },
      };
    }
  }

  return null;
}

function unitNumber(text: string, unitPattern: string, occurrence = 0) {
  const matches = [
    ...text.matchAll(
      new RegExp(`(-?\\d+(?:[.,]\\d+)?)\\s*${unitPattern}`, "gi")
    ),
  ];
  const raw = matches[occurrence]?.[1];
  return raw ? parsePtNumber(raw) : null;
}

function physics(text: string): OliviaCalculation | null {
  const nrm = normalize(text);

  if (/lei de ohm|resistor|corrente eletrica/.test(nrm)) {
    const resistance = unitNumber(text, "(?:ohm(?:s)?|Ω)");
    const voltage = unitNumber(text, "v(?:olt(?:s)?)?\\b");
    if (resistance !== null && voltage !== null && resistance !== 0) {
      const current = voltage / resistance;
      return {
        category: "physics",
        topic: "ohms_law",
        reply: `Corrente elétrica: **${fmt(current)} A**.\nLei de Ohm: I = V/R = ${fmt(voltage)} V / ${fmt(resistance)} Ω.`,
        result: { current, voltage, resistance },
      };
    }
  }

  if (/energia potencial|potencial gravit/.test(nrm)) {
    const mass = unitNumber(text, "kg");
    const height = unitNumber(text, "m\\b");
    const gMatch = nrm.match(/g\s*=\s*(-?\d+(?:[.,]\d+)?)/)?.[1];
    const g = gMatch ? parsePtNumber(gMatch) : 9.8;
    if (mass !== null && height !== null) {
      const energy = mass * g * height;
      return {
        category: "physics",
        topic: "potential_energy",
        reply: `Energia potencial gravitacional: **${fmt(energy)} J**.\nFórmula: Eₚ = mgh = ${fmt(mass)} × ${fmt(g)} × ${fmt(height)}.`,
        result: { energy, mass, gravity: g, height },
      };
    }
  }

  if (/energia cinet/.test(nrm)) {
    const mass = unitNumber(text, "kg");
    const velocity = unitNumber(text, "m/s");
    if (mass !== null && velocity !== null) {
      const energy = 0.5 * mass * velocity * velocity;
      return {
        category: "physics",
        topic: "kinetic_energy",
        reply: `Energia cinética: **${fmt(energy)} J**.\nFórmula: E꜀ = ½mv² = ½ × ${fmt(mass)} × ${fmt(velocity)}².`,
        result: { energy, mass, velocity },
      };
    }
  }

  if (/forca resultante|segunda lei|\bf\s*=\s*m/.test(nrm)) {
    const mass = unitNumber(text, "kg");
    const acceleration = unitNumber(text, "m/s(?:²|\\^2|2)");
    if (mass !== null && acceleration !== null) {
      const force = mass * acceleration;
      return {
        category: "physics",
        topic: "newtons_second_law",
        reply: `Força resultante: **${fmt(force)} N**.\nSegunda lei de Newton: F = ma = ${fmt(mass)} × ${fmt(acceleration)}.`,
        result: { force, mass, acceleration },
      };
    }
  }

  if (/aceleracao|aceleração/.test(text.toLowerCase())) {
    const velocities = [
      ...text.matchAll(/(-?\d+(?:[.,]\d+)?)\s*m\/s(?![²^2])/gi),
    ].map(match => parsePtNumber(match[1]));
    const time = unitNumber(text, "s(?:egundo(?:s)?)?\\b");
    if (velocities.length >= 2 && time !== null && time !== 0) {
      const acceleration = (velocities[1] - velocities[0]) / time;
      return {
        category: "physics",
        topic: "acceleration",
        reply: `Aceleração média: **${fmt(acceleration)} m/s²**.\nFórmula: a = Δv/Δt = (${fmt(velocities[1])} − ${fmt(velocities[0])})/${fmt(time)}.`,
        result: {
          acceleration,
          initialVelocity: velocities[0],
          finalVelocity: velocities[1],
          time,
        },
      };
    }
  }

  if (/velocidade media|velocidade média|percorre/.test(text.toLowerCase())) {
    const distanceKm = unitNumber(text, "km");
    const hours = unitNumber(text, "h(?:ora(?:s)?)?\\b");
    if (distanceKm !== null && hours !== null && hours !== 0) {
      const speed = distanceKm / hours;
      return {
        category: "physics",
        topic: "average_speed",
        reply: `Velocidade média: **${fmt(speed)} km/h**.\nFórmula: v = Δs/Δt = ${fmt(distanceKm)} km / ${fmt(hours)} h.`,
        result: { speed, distanceKm, hours },
      };
    }
  }

  return null;
}

export function solveOliviaCalculation(
  question: string
): OliviaCalculation | null {
  const text = String(question || "").trim();
  if (!text) return null;
  return financial(text) ?? physics(text);
}

import { eq } from "drizzle-orm";
import {
  db,
  financialPoliciesTable,
  leasesTable,
  offersTable,
  partnersTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import { getStatusForPoints } from "./bonus";

const DEMO_USER = {
  phone: "+79990000001",
  name: "Демо-пользователь",
  email: "demo@loyalti.local",
  isPhoneVerified: true,
} as const;

const DEMO_PARTNER_LOGOS: Record<string, string> = {
  "ПИК-Аренда": "/api/partner-logos/pik-arenda.svg",
  "Мосэнергосбыт": "/api/partner-logos/mosenergosbyt.svg",
  "Ситимобил": "/api/partner-logos/sitimobil.svg",
  "Аптека 36,6": "/api/partner-logos/apteka-36-6.svg",
  "ВкусВилл": "/api/partner-logos/vkusvill.svg",
  "Перекрёсток": "/api/partner-logos/perekrestok.svg",
  "Домклик Сервисы": "/api/partner-logos/domclick-servisy.svg",
  "Городские Бани": "/api/partner-logos/gorodskie-bani.svg",
  "Метрополитен": "/api/partner-logos/metropoliten.svg",
  "РемонтПро": "/api/partner-logos/remontpro.svg",
  "Домовой": "/api/partner-logos/domovoi.svg",
  "Яндекс Go": "/api/partner-logos/yandex-go.svg",
  "Здравсити": "/api/partner-logos/zdravsiti.svg",
};

const DEMO_PARTNERS = [
  {
    name: "Домовой",
    logoUrl: DEMO_PARTNER_LOGOS["Домовой"],
    category: "rent",
    description: "Оплата аренды и коммунальных услуг",
    bonusMultiplier: "1.5",
    address: "ул. Тверская, 12",
    city: "Москва",
    isActive: true,
  },
  {
    name: "Перекрёсток",
    logoUrl: DEMO_PARTNER_LOGOS["Перекрёсток"],
    category: "food",
    description: "Продукты и товары для дома",
    bonusMultiplier: "1.2",
    address: "ул. Большая Дмитровка, 8",
    city: "Москва",
    isActive: true,
  },
  {
    name: "Яндекс Go",
    logoUrl: DEMO_PARTNER_LOGOS["Яндекс Go"],
    category: "transport",
    description: "Поездки по городу с повышенным кэшбэком",
    bonusMultiplier: "1.3",
    address: null,
    city: "Москва",
    isActive: true,
  },
  {
    name: "Здравсити",
    logoUrl: DEMO_PARTNER_LOGOS["Здравсити"],
    category: "health",
    description: "Аптеки и забота о здоровье",
    bonusMultiplier: "1.4",
    address: null,
    city: "Москва",
    isActive: true,
  },
] as const;

const DEMO_OFFERS = [
  {
    partnerName: "Домовой",
    title: "Оплатите аренду — получите больше баллов",
    description: "Получайте повышенные баллы за своевременную оплату аренды.",
    bonusMultiplier: "1.5",
    category: "rent",
    minAmountRub: "30000.00",
  },
  {
    partnerName: "Перекрёсток",
    title: "12% баллами на покупки для дома",
    description: "Акция действует на товары для дома и продукты.",
    bonusMultiplier: "1.2",
    category: "food",
    minAmountRub: "1500.00",
  },
  {
    partnerName: "Яндекс Go",
    title: "Больше баллов за поездки",
    description: "Получайте повышенные баллы за поездки в будни.",
    bonusMultiplier: "1.3",
    category: "transport",
    minAmountRub: "500.00",
  },
] as const;

const DEMO_LEASES = [
  {
    address: "ул. Тверская, 12",
    city: "Москва",
    landlordName: "Александр Воронов",
    monthlyRentRub: "78000.00",
    startDate: new Date("2024-04-15T00:00:00.000Z"),
    endDate: null,
    isActive: true,
    depositAmountRub: "78000.00",
    depositReturned: null,
    onTimePayments: 18,
    latePayments: 0,
    landlordRating: "4.8",
  },
  {
    address: "ул. Мясницкая, 7",
    city: "Москва",
    landlordName: "Мария Соколова",
    monthlyRentRub: "65000.00",
    startDate: new Date("2022-01-10T00:00:00.000Z"),
    endDate: new Date("2024-03-31T00:00:00.000Z"),
    isActive: false,
    depositAmountRub: "65000.00",
    depositReturned: true,
    onTimePayments: 26,
    latePayments: 1,
    landlordRating: "4.5",
  },
] as const;

function demoTransactions(partnerIds: Map<string, number>) {
  const createdAt = new Date();
  return [
    {
      partnerId: partnerIds.get("Домовой") ?? null,
      type: "earn",
      category: "rent",
      amountRub: "78000.00",
      pointsEarned: 1170,
      multiplier: "1.5",
      description: "Оплата аренды — ул. Тверская, 12",
      createdAt: new Date(createdAt.getTime() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      partnerId: partnerIds.get("Перекрёсток") ?? null,
      type: "earn",
      category: "food",
      amountRub: "4280.00",
      pointsEarned: 514,
      multiplier: "1.2",
      description: "Покупка продуктов",
      createdAt: new Date(createdAt.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      partnerId: partnerIds.get("Яндекс Go") ?? null,
      type: "earn",
      category: "transport",
      amountRub: "860.00",
      pointsEarned: 112,
      multiplier: "1.3",
      description: "Поездки по городу",
      createdAt: new Date(createdAt.getTime() - 8 * 24 * 60 * 60 * 1000),
    },
    {
      partnerId: partnerIds.get("Здравсити") ?? null,
      type: "earn",
      category: "health",
      amountRub: "2150.00",
      pointsEarned: 301,
      multiplier: "1.4",
      description: "Покупка в аптеке",
      createdAt: new Date(createdAt.getTime() - 12 * 24 * 60 * 60 * 1000),
    },
  ];
}

/**
 * Populate the default account with a small, stable set of records.
 *
 * The API is also used by a fresh Expo preview, where authentication may not
 * have happened yet. It is important that this initializer never overwrites
 * user-created records, so each record is checked by its stable display name.
 * The default account is created only when the database has no user yet.
 */
export async function seedDemoData(): Promise<{
  user: number;
  partners: number;
  offers: number;
  leases: number;
  transactions: number;
  balance: number;
}> {
  return db.transaction(async (tx) => {
    const [activePolicy] = await tx
      .select({ id: financialPoliciesTable.id })
      .from(financialPoliciesTable)
      .limit(1);
    if (!activePolicy) {
      await tx.insert(financialPoliciesTable).values({
        version: 1,
        currency: "RUB",
        purchaseRedemptionRate: "0.1500",
        partnerFeeRate: "0.0150",
        rentalBonusRate: "0.1000",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      });
    }

    let [user] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, 1))
      .limit(1);

    if (!user) {
      [user] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, DEMO_USER.phone))
        .limit(1);
    }

    let userCount = 0;
    if (!user) {
      [user] = await tx
        .insert(usersTable)
        .values(DEMO_USER)
        .returning({ id: usersTable.id });
      userCount = 1;
    }

    const existingPartners = await tx.select().from(partnersTable);
    const partnerIds = new Map(existingPartners.map((partner) => [partner.name, partner.id]));
    const missingPartners = DEMO_PARTNERS.filter((partner) => !partnerIds.has(partner.name));

    if (missingPartners.length > 0) {
      const insertedPartners = await tx.insert(partnersTable).values(missingPartners).returning();
      for (const partner of insertedPartners) {
        partnerIds.set(partner.name, partner.id);
      }
    }

    // Keep the curated demo brand assets attached to existing rows as well.
    // This also repairs databases seeded before logoUrl was introduced.
    for (const partner of existingPartners) {
      const logoUrl = DEMO_PARTNER_LOGOS[partner.name];
      if (logoUrl && !partner.logoObjectPath && partner.logoUrl !== logoUrl) {
        await tx
          .update(partnersTable)
          .set({ logoUrl })
          .where(eq(partnersTable.id, partner.id));
      }
    }

    const existingOffers = await tx
      .select({ title: offersTable.title })
      .from(offersTable);
    const expiresAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const existingOfferTitles = new Set(existingOffers.map((offer) => offer.title));
    const missingOffers = DEMO_OFFERS.filter((offer) => !existingOfferTitles.has(offer.title));

    if (missingOffers.length > 0) {
      await tx.insert(offersTable).values(
        missingOffers.map(({ partnerName, ...offer }) => ({
          ...offer,
          partnerId: partnerIds.get(partnerName) as number,
          expiresAt,
          isActive: true,
        })),
      );
    }

    // Keep records owned by this seed usable after the original 45-day
    // expiration window, without changing unrelated offers.
    for (const demoOffer of DEMO_OFFERS) {
      if (!existingOfferTitles.has(demoOffer.title)) continue;
      const partnerId = partnerIds.get(demoOffer.partnerName);
      if (!partnerId) continue;
      await tx
        .update(offersTable)
        .set({
          partnerId,
          description: demoOffer.description,
          bonusMultiplier: demoOffer.bonusMultiplier,
          category: demoOffer.category,
          minAmountRub: demoOffer.minAmountRub,
          isActive: true,
          expiresAt,
        })
        .where(eq(offersTable.title, demoOffer.title));
    }

    const existingLeases = await tx
      .select({ address: leasesTable.address })
      .from(leasesTable)
      .where(eq(leasesTable.userId, user.id));
    const leaseAddresses = new Set(existingLeases.map((lease) => lease.address));
    const missingLeases = DEMO_LEASES
      .filter((lease) => !leaseAddresses.has(lease.address))
      .map((lease) => ({ ...lease, userId: user.id }));

    if (missingLeases.length > 0) {
      await tx.insert(leasesTable).values(missingLeases);
    }

    const existingTransactions = await tx
      .select({ description: transactionsTable.description })
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, user.id));
    const transactionDescriptions = new Set(
      existingTransactions.map((transaction) => transaction.description),
    );
    const missingTransactions = demoTransactions(partnerIds)
      .filter((transaction) => !transactionDescriptions.has(transaction.description))
      .map((transaction) => ({ ...transaction, userId: user.id }));

    if (missingTransactions.length > 0) {
      await tx.insert(transactionsTable).values(missingTransactions);
    }

    const allTransactions = await tx
      .select({
        type: transactionsTable.type,
        pointsEarned: transactionsTable.pointsEarned,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, user.id));
    const balance = Math.max(
      0,
      allTransactions.reduce(
        (total, transaction) =>
          total +
          (transaction.type === "earn" || transaction.type === "bonus"
            ? transaction.pointsEarned
            : -transaction.pointsEarned),
        0,
      ),
    );
    const status = getStatusForPoints(balance);

    // Dashboard reads this denormalized column directly. Reconcile it after
    // inserts so direct seed runs cannot leave a zero or stale balance.
    const [currentUser] = await tx
      .select({ bonusBalanceRub: usersTable.bonusBalanceRub })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    await tx
      .update(usersTable)
      .set({
        pointsBalance: balance,
        status,
        ...(currentUser?.bonusBalanceRub === null
          ? { bonusBalanceRub: (balance * 0.8).toFixed(2) }
          : {}),
      })
      .where(eq(usersTable.id, user.id));

    return {
      user: userCount,
      partners: missingPartners.length,
      offers: missingOffers.length,
      leases: missingLeases.length,
      transactions: missingTransactions.length,
      balance,
    };
  });
}

/**
 * Deterministic, synthetic benchmark. Every directly user-routeable intent has
 * exactly 100 distinct prompts: 30 per language (English/French/Arabic), plus
 * 10 contextual short follow-ups. Typos are generated deterministically so the
 * corpus is reproducible. Prompts are test data and are never printed.
 */
export const CORPUS_VERSION = '2.1.0'
export const CASES_PER_INTENT = 100

const FIXTURES = [
  { type: 'capabilities', en: 'what can you do in Blossom', fr: 'que peux-tu faire dans Blossom', ar: 'ماذا يمكنك أن تفعل في بلوسوم', follow: 'what else can you do', context: {} },
  { type: 'cash_register', en: 'show cash register transactions today', fr: 'montre les transactions de caisse aujourd hui', ar: 'اعرض معاملات الصندوق اليوم', follow: 'show the transactions', context: { topic: 'cash' } },
  { type: 'created_today', en: 'which orders were created today', fr: 'quelles commandes ont ete creees aujourd hui', ar: 'ما الطلبات التي أُنشئت اليوم', follow: 'and yesterday', context: { topic: 'orders' } },
  { type: 'customer_lookup', en: 'find customer Amal Benali phone', fr: 'trouve le numero du client Amal Benali', ar: 'ابحث عن رقم العميل أمل بن علي', follow: 'phone', context: { topic: 'customers', activeCustomer: 'Amal Benali', activeEntity: { type: 'customer', name: 'Amal Benali' } } },
  { type: 'deliveries', en: 'show today delivery run', fr: 'montre les livraisons prevues aujourd hui', ar: 'اعرض توصيلات اليوم', follow: 'show tomorrow', context: { topic: 'delivery' } },
  { type: 'deliveries_period', en: 'show deliveries this week', fr: 'montre les livraisons cette semaine', ar: 'اعرض التوصيلات هذا الأسبوع', follow: 'and next week', context: { topic: 'delivery' } },
  { type: 'greeting', en: 'good morning Blossom', fr: 'bonjour Blossom', ar: 'صباح الخير يا بلوسوم', follow: 'how are you', context: {} },
  { type: 'help', en: 'tell me something general', fr: 'parle moi de quelque chose', ar: 'أخبرني بشيء عام', follow: 'help me', context: {} },
  { type: 'how_to', en: 'how do I create an order', fr: 'comment creer une commande', ar: 'كيف أنشئ طلبا جديدا', follow: 'show me how', context: {} },
  { type: 'navigate', en: 'go to the orders page', fr: 'ouvre la page des commandes', ar: 'افتح صفحة الطلبات', follow: 'open it', context: {} },
  { type: 'order_cancel', en: 'cancel order 786', fr: 'annule la commande 786', ar: 'ألغ الطلب 786', follow: '786', context: { topic: 'orders', intent: { type: 'order_cancel' }, activeOrder: { orderNumber: '786' } } },
  { type: 'order_clarification', en: 'what is the order status', fr: 'quel est le statut de la commande', ar: 'ما حالة الطلب', follow: 'status', context: { topic: 'orders' } },
  { type: 'order_create', en: 'create a new order for Amal', fr: 'cree une nouvelle commande pour Amal', ar: 'أنشئ طلبا جديدا لأمل', follow: 'add three red roses', context: { topic: 'orders', currentTask: { type: 'order_create' } } },
  { type: 'order_customer_fact', en: 'show the order for Djabali Wasila', fr: 'montre la commande de Djabali Wasila', ar: 'أرني طلب جبالي وسيلة', follow: 'what about Hedade', context: { topic: 'orders', activeCustomer: 'Djabali Wasila' } },
  { type: 'order_delay', en: 'delay order 786 until 2030-11-20', fr: 'reporte la commande 786 au 2030-11-20', ar: 'أجل الطلب 786 إلى 2030-11-20', follow: '2030-11-20', context: { topic: 'orders', activeOrder: { orderNumber: '786' } }, previousIntent: { type: 'order_delay', orderNumber: '786' } },
  { type: 'order_delete', en: 'delete order 786', fr: 'supprime la commande 786', ar: 'احذف الطلب 786', follow: '786', context: { topic: 'orders', activeOrder: { orderNumber: '786' } }, previousIntent: { type: 'order_delete' } },
  { type: 'order_edit', en: 'edit order 786 add two red roses', fr: 'modifie la commande 786 ajoute deux roses rouges', ar: 'عدّل الطلب 786 وأضف وردتين حمراوين', follow: 'add two roses to this order', context: { topic: 'orders', activeOrder: { orderNumber: '786' } }, previousIntent: { type: 'order_edit', orderNumber: '786' } },
  { type: 'order_lookup', en: 'show me order 786', fr: 'montre moi la commande 786', ar: 'اعرض الطلب 786', follow: 'payment status', context: { topic: 'orders', activeOrder: { orderNumber: '786' }, activeEntity: { type: 'order', orderNumber: '786' } }, previousIntent: { type: 'order_lookup', orderNumber: '786', facts: ['full'] } },
  { type: 'order_payment', en: 'record payment of 1000 DA for order 786', fr: 'enregistre un paiement de 1000 DA pour la commande 786', ar: 'سجل دفع 1000 دج للطلب 786', follow: '786', context: { topic: 'orders', activeOrder: { orderNumber: '786' } }, previousIntent: { type: 'order_payment', action: 'payment' } },
  { type: 'order_search', en: 'find orders by client name Djabali Wasila', fr: 'trouve les commandes par nom du client Djabali Wasila', ar: 'ابحث عن الطلبات حسب اسم العميل جبالي وسيلة', follow: 'find orders over 3000 DA', context: { topic: 'orders' }, previousIntent: { type: 'order_search' } },
  { type: 'orders_created_by', en: 'who created the last 3 orders', fr: 'qui a cree les 3 dernieres commandes', ar: 'من أنشأ آخر 3 طلبات', follow: 'who made them', context: { topic: 'orders' }, previousIntent: { type: 'orders_created_by', limit: 3 } },
  { type: 'orders_due', en: 'what orders are due tomorrow', fr: 'quelles commandes sont prevues demain', ar: 'ما الطلبات المستحقة غدا', follow: 'tomorrow', context: { topic: 'orders' }, previousIntent: { type: 'orders_due', offset: 1 } },
  { type: 'orders_list', en: 'list all recent orders', fr: 'liste les commandes recentes', ar: 'اعرض أحدث الطلبات', follow: 'show more orders', context: { topic: 'orders' }, previousIntent: { type: 'orders_list' } },
  { type: 'orders_period', en: 'show orders created this week', fr: 'montre les commandes creees cette semaine', ar: 'اعرض الطلبات التي أُنشئت هذا الأسبوع', follow: 'and last week', context: { topic: 'orders' }, previousIntent: { type: 'orders_period' } },
  { type: 'orders_status', en: 'list processing orders', fr: 'liste les commandes en cours', ar: 'اعرض الطلبات قيد المعالجة', follow: 'show the done ones', context: { topic: 'orders' }, previousIntent: { type: 'orders_status', statuses: ['processing'] } },
  { type: 'overdue', en: 'which orders are overdue', fr: 'quelles commandes sont en retard', ar: 'ما الطلبات المتأخرة', follow: 'show me the late ones', context: { topic: 'orders' }, previousIntent: { type: 'overdue' } },
  { type: 'overview', en: 'give me a business overview', fr: 'donne moi un apercu de l activite', ar: 'أعطني ملخصا عن العمل', follow: 'anything else', context: { topic: 'reports' }, previousIntent: { type: 'overview' } },
  { type: 'product_price', followType: 'product_stock', en: 'how much do red roses cost', fr: 'combien coutent les roses rouges', ar: 'كم سعر الورود الحمراء', follow: 'and the stock', context: { topic: 'stock', activeProduct: 'red roses', activeEntity: { type: 'product', name: 'red roses' } }, previousIntent: { type: 'product_price', search: 'red roses' } },
  { type: 'product_stock', followType: 'product_price', en: 'how many red flowers are left in stock', fr: 'combien de fleurs rouges reste en stock', ar: 'كم تبقى من الزهور الحمراء في المخزون', follow: 'and their price', context: { topic: 'stock', activeProduct: 'red flowers', activeEntity: { type: 'product', name: 'red flowers' } }, previousIntent: { type: 'product_stock', search: 'red flowers' } },
  { type: 'report_period', en: 'show sales yesterday', fr: 'montre les ventes hier', ar: 'اعرض مبيعات الأمس', follow: 'and this week', context: { topic: 'reports' }, previousIntent: { type: 'report_period' } },
  { type: 'sales', en: 'how much money did we make', fr: 'combien d argent avons nous gagne', ar: 'كم حققنا من المال', follow: 'sales total', context: { topic: 'reports' }, previousIntent: { type: 'sales' } },
  { type: 'select_result', en: 'the second one', fr: 'la deuxieme', ar: 'الثاني', follow: 'the first one', context: { topic: 'orders', recentOrders: [{ orderNumber: '786' }, { orderNumber: '787' }], activeResultSet: { topic: 'orders', rows: [{ orderNumber: '786' }, { orderNumber: '787' }] } }, previousIntent: { type: 'orders_list' } },
  { type: 'stock_waste', en: 'show flower waste this month', fr: 'montre les pertes de fleurs ce mois ci', ar: 'اعرض هدر الزهور هذا الشهر', follow: 'show details', context: { topic: 'stock' }, previousIntent: { type: 'stock_waste' } },
  { type: 'supplier_lookup', en: 'find supplier Green Garden', fr: 'trouve le fournisseur Green Garden', ar: 'ابحث عن المورد جرين جاردن', follow: 'their phone number', context: { topic: 'suppliers' }, previousIntent: { type: 'supplier_lookup', name: 'Green Garden' } },
  { type: 'unpaid', en: 'show unpaid orders', fr: 'montre les commandes impayees', ar: 'اعرض الطلبات غير المدفوعة', follow: 'how much is still owed', context: { topic: 'reports' }, previousIntent: { type: 'unpaid' } },
]

function typo(text, variant) {
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)]
  const candidates = words.filter((match) => [...match[0]].length >= 5)
  if (!candidates.length) return text
  const selected = candidates[variant % candidates.length]
  const letters = [...selected[0]]
  const at = 1 + (Math.floor(variant / candidates.length) % Math.max(1, letters.length - 2))
  const style = Math.floor(variant / 7) % 3
  if (style === 0) letters.splice(at, 1)
  else if (style === 1) [letters[at], letters[at + 1]] = [letters[at + 1], letters[at]]
  else letters.splice(at, 0, letters[at])
  const changed = letters.join('')
  return `${text.slice(0, selected.index)}${changed}${text.slice(selected.index + selected[0].length)}`
}

function languageSamples(fixture, language) {
  const base = fixture[language]
  const wrappers = language === 'en' ? [`please ${base}`, `can you ${base}`]
    : language === 'fr' ? [`s il te plait ${base}`, `peux tu ${base}`]
      : [`من فضلك ${base}`, `هل يمكنك ${base}`]
  const phrases = [base, ...wrappers]
  const result = []
  const seen = new Set()
  for (const [phraseIndex, phrase] of phrases.entries()) {
    for (let index = 0; index < 10; index += 1) {
      const candidate = index === 0 ? phrase : typo(phrase, index + (phraseIndex * 19))
      if (!seen.has(candidate)) {
        seen.add(candidate)
        result.push({ prompt: candidate, mutation: phraseIndex === 0 && index === 0 ? 'clean' : index === 0 ? 'paraphrase' : 'typo' })
      }
    }
  }
  // Very short cues have few unique character mutations. Use controlled,
  // language-specific polite repeats as the final deterministic fallback.
  for (let index = 1; result.length < 30; index += 1) {
    const filler = language === 'en' ? 'please '.repeat(index)
      : language === 'fr' ? 's il te plait '.repeat(index)
        : 'من فضلك '.repeat(index)
    const candidate = `${base} ${filler}`.trim()
    if (!seen.has(candidate)) {
      seen.add(candidate)
      result.push({ prompt: candidate, mutation: 'paraphrase' })
    }
  }
  return result.slice(0, 30)
}

function followupContext(fixture) {
  return { topic: fixture.context?.topic || null, ...fixture.context, intent: fixture.previousIntent || { type: fixture.type } }
}

function shortFollowups(fixture) {
  const base = fixture.follow
  // Keep wrappers grammatical when the seed already starts with a connector
  // (for example, “and yesterday”). The prior context is supplied to every
  // variant below because short follow-ups are only meaningful in a conversation.
  const cue = base.replace(/^(?:and|et)\s+/i, '').trim()
  const prompts = [
    { prompt: base, language: 'en' },
    { prompt: `and ${cue}`, language: 'en' },
    { prompt: `what about ${cue}`, language: 'en' },
    { prompt: `please ${cue}`, language: 'en' },
    { prompt: `et ${cue}`, language: 'fr' },
    { prompt: `et pour ${cue}`, language: 'fr' },
    { prompt: `${cue} s il te plait`, language: 'fr' },
    { prompt: `وماذا عن ${cue}`, language: 'ar' },
    { prompt: `وكذلك ${cue}`, language: 'ar' },
    { prompt: `من فضلك ${cue}`, language: 'ar' },
  ]
  const unique = []
  const seen = new Set()
  for (const sample of prompts) {
    if (!seen.has(sample.prompt)) { seen.add(sample.prompt); unique.push(sample) }
  }
  for (let index = 1; unique.length < 10; index += 1) {
    const language = ['en', 'fr', 'ar'][(index - 1) % 3]
    const filler = language === 'en' ? 'please '.repeat(index)
      : language === 'fr' ? 's il te plait '.repeat(index)
        : 'من فضلك '.repeat(index)
    const prompt = `${cue} ${filler}`.trim()
    if (!seen.has(prompt)) { seen.add(prompt); unique.push({ prompt, language }) }
  }
  return unique.slice(0, 10).map((sample, index) => ({ ...sample, mutation: index === 0 ? 'short-followup' : 'short-followup-variation' }))
}

export function buildEvaluationCorpus() {
  const corpus = []
  for (const fixture of FIXTURES) {
    const seeds = ['en', 'fr', 'ar'].flatMap((language) => languageSamples(fixture, language).map((sample) => ({ ...sample, language })))
    // 90 multilingual base/typo cases plus 10 distinct contextual turns.
    const selectedFollowups = shortFollowups(fixture)
    const samples = [...seeds, ...selectedFollowups]
    if (seeds.length !== 90 || selectedFollowups.length !== 10 || new Set(samples.map(({ prompt }) => prompt)).size !== CASES_PER_INTENT) {
      throw new Error(`Evaluation corpus fixture ${fixture.type} must produce ${CASES_PER_INTENT} unique prompts.`)
    }
    for (const [index, sample] of samples.entries()) {
      corpus.push({
        id: `v2-${fixture.type}-${String(index + 1).padStart(3, '0')}`,
        family: fixture.type,
        type: sample.mutation.startsWith('short-followup') ? fixture.followType || fixture.type : fixture.type,
        prompt: sample.prompt,
        language: sample.language,
        mutation: sample.mutation,
        context: sample.mutation.startsWith('short-followup') ? followupContext(fixture) : fixture.context,
        previousIntent: sample.mutation.startsWith('short-followup') ? fixture.previousIntent || { type: fixture.type } : fixture.previousIntent,
      })
    }
  }
  if (corpus.length !== FIXTURES.length * CASES_PER_INTENT) throw new Error('Evaluation corpus size does not match its intent coverage.')
  return corpus
}

export const EVALUATION_INTENTS_V2 = FIXTURES.map(({ type }) => type)

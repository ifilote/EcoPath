namespace EcoPath.Services
{
    /// <summary>
    /// Eco-motivational quote engine with weather-aware selection.
    /// 
    /// Design decisions:
    /// ─────────────────
    /// • 10+ quotes per weather type — enough variety for daily users.
    /// • No consecutive repetition — tracks last served index per type.
    /// • Optional ecoScore influence — high performers get aspirational quotes.
    /// • Thread-safe via lock on _lastIndices dictionary.
    /// • Stateless-friendly: registered as Singleton since quotes are static data.
    /// • Future: swap static dict for DB/AI-generated quotes without changing interface.
    /// </summary>
    public class QuoteService : IQuoteService
    {
        private readonly Dictionary<string, int> _lastIndices = new();
        private readonly object _lock = new();
        private static readonly Random _random = new();

        public QuoteResult GetQuote(string weatherType, double ecoScore = 0)
        {
            var normalizedType = NormalizeType(weatherType);
            var quotes = GetQuotesForWeather(normalizedType, ecoScore);

            if (quotes.Count == 0)
            {
                quotes = GetQuotesForWeather("clear", 0);
            }

            var index = PickNonRepeating(normalizedType, quotes.Count);
            var quote = quotes[index];

            return new QuoteResult
            {
                Text = quote.Text,
                Author = quote.Author,
                WeatherType = normalizedType
            };
        }

        private int PickNonRepeating(string type, int count)
        {
            if (count <= 1) return 0;

            lock (_lock)
            {
                _lastIndices.TryGetValue(type, out int lastIndex);
                int newIndex;
                do
                {
                    newIndex = _random.Next(count);
                } while (newIndex == lastIndex && count > 1);

                _lastIndices[type] = newIndex;
                return newIndex;
            }
        }

        private static string NormalizeType(string weatherType) => weatherType?.ToLowerInvariant() switch
        {
            "clear" => "clear",
            "clouds" => "clouds",
            "rain" or "drizzle" => "rain",
            "thunderstorm" => "thunderstorm",
            "snow" => "snow",
            "mist" or "fog" or "haze" => "mist",
            _ => "clear"
        };

        private static List<(string Text, string Author)> GetQuotesForWeather(string type, double ecoScore)
        {
            // High eco performers get aspirational "leader" quotes mixed in
            var baseQuotes = QuoteBank.TryGetValue(type, out var quotes) ? quotes : QuoteBank["clear"];

            if (ecoScore >= 500 && LeaderQuotes.Count > 0)
            {
                var combined = new List<(string, string)>(baseQuotes);
                combined.AddRange(LeaderQuotes);
                return combined;
            }

            return baseQuotes;
        }

        // ═══════════════════════════════════════════════════════════════
        // QUOTE BANK — Eco-motivational, movement-focused, emotionally strong
        // ═══════════════════════════════════════════════════════════════

        private static readonly Dictionary<string, List<(string Text, string Author)>> QuoteBank = new()
        {
            ["clear"] = new()
            {
                ("Soarele strălucește pe drumul tău verde. Fiecare pas contează.", "EcoPath"),
                ("Ziua perfectă pentru o călătorie eco. Lasă mașina, ia viața în pași.", "EcoPath"),
                ("Cerul senin te cheamă afară. Mergi pe jos, inspiră viitorul.", "EcoPath"),
                ("Energia soarelui e gratuită. Folosește-o — pedalează azi.", "EcoPath"),
                ("Sub cerul liber, fiecare kilometru verde e o victorie.", "EcoPath"),
                ("Vremea bună, inima verde. Alege transportul sustenabil.", "EcoPath"),
                ("Azi e ziua ta să faci diferența. Un pas mic, un impact mare.", "EcoPath"),
                ("Soarele răsare pentru cei care merg cu pământul, nu împotriva lui.", "EcoPath"),
                ("Frumusețea zilei se descoperă mergând, nu conducând.", "EcoPath"),
                ("Lumina de azi îți arată calea verde. Urmează-o.", "EcoPath"),
                ("Fiecare călătorie eco e un vot pentru un viitor mai curat.", "EcoPath"),
                ("Azi, pașii tăi plantează semințe de schimbare.", "EcoPath")
            },

            ["clouds"] = new()
            {
                ("Norii nu opresc un eco-warrior. Pornește la drum!", "EcoPath"),
                ("Sub nori se ascund cele mai frumoase călătorii.", "EcoPath"),
                ("Cerul înnnorat e fundalul perfect pentru aventura ta verde.", "EcoPath"),
                ("Norii sunt doar decor — mișcarea ta e spectacolul.", "EcoPath"),
                ("Perfect pentru o plimbare. Aerul e proaspăt, drumul te cheamă.", "EcoPath"),
                ("Nu ai nevoie de soare pentru a străluci prin faptele tale eco.", "EcoPath"),
                ("Sub acoperișul norilor, pământul respiră mai ușor.", "EcoPath"),
                ("Zi acoperită de nori, dar plină de potențial verde.", "EcoPath"),
                ("Norii aduc răcoare — perfectă pentru pedalat.", "EcoPath"),
                ("Când cerul e gri, tu ești curcubeul verde al orașului.", "EcoPath"),
                ("Umbrele norilor te protejează pe drum. Mergi înainte!", "EcoPath")
            },

            ["rain"] = new()
            {
                ("Ploaia hrănește pământul. Transportul public te hrănește pe tine.", "EcoPath"),
                ("Stropii de ploaie sunt aplauzele naturii pentru alegerea ta eco.", "EcoPath"),
                ("Nu lăsa ploaia să te oprească. Ia tramvaiul, citește o carte.", "EcoPath"),
                ("Ploaia vine și trece, dar impactul tău eco rămâne.", "EcoPath"),
                ("Zi de ploaie = zi perfectă de transport public.", "EcoPath"),
                ("Sub umbrelă sau în metrou — mergi verde indiferent de vreme.", "EcoPath"),
                ("Când plouă, natura curăță lumea. Tu curăță-ți amprenta de carbon.", "EcoPath"),
                ("Ritmul ploii e melodia schimbării. Dansează pe ea.", "EcoPath"),
                ("Ploaia spală aerul — transportul eco îl păstrează curat.", "EcoPath"),
                ("Fiecare strop de ploaie e o promisiune verde. Și tu faci una azi.", "EcoPath"),
                ("Picăturile cad, tu te ridici. Călătorește eco.", "EcoPath"),
                ("Ploaia nu e obstacol, e motivație. Ia trenul, salvează planeta.", "EcoPath")
            },

            ["thunderstorm"] = new()
            {
                ("Furtuna trage cortina — azi e zi de planificare eco.", "EcoPath"),
                ("Tunetul nu sperie un eco-warrior cu un plan.", "EcoPath"),
                ("Energia furtunii e a naturii. Economisește-ți pe a ta — stai în siguranță.", "EcoPath"),
                ("După furtună, pământul e reînnoit. Și tu vei fi.", "EcoPath"),
                ("Fulgerele inspiră. Planifică-ți următoarea călătorie verde.", "EcoPath"),
                ("Furtuna trece, impactul tău eco rămâne.", "EcoPath"),
                ("Azi te odihnești, mâine pedalezi. Echilibru verde.", "EcoPath"),
                ("Natura arată puterea ei. Arată-i și tu pe a ta — eco.", "EcoPath"),
                ("Când tunetul vorbește, ascultă. Și planifică verde.", "EcoPath"),
                ("Furtunile climatice se combat cu acțiuni mici. Începe cu pași.", "EcoPath")
            },

            ["snow"] = new()
            {
                ("Zăpada acoperă tot în alb. Acoperă orașul cu verde — transport eco.", "EcoPath"),
                ("Iarna nu oprește mișcarea. Metroul e prietenul tău.", "EcoPath"),
                ("Fiecare fulg e unic. La fel și contribuția ta eco.", "EcoPath"),
                ("Albul zăpezii, verdele inimii tale. Călătorește sustenabil.", "EcoPath"),
                ("Frigul nu e scuză. Tramvaiul e cald și verde.", "EcoPath"),
                ("Sub zăpadă, semințele eco cresc. Și tu crești azi.", "EcoPath"),
                ("Iarna testează. Eco-warriorii persistă.", "EcoPath"),
                ("Zăpada cade lin, ca și impactul tău pozitiv — constant.", "EcoPath"),
                ("Când ninge, lumea tace. Ascultă-ți conștiința eco.", "EcoPath"),
                ("Iarna vine cu provocări, dar și cu oportunități verzi.", "EcoPath"),
                ("Frigul de afară, căldura din interior. Ia transportul public.", "EcoPath")
            },

            ["mist"] = new()
            {
                ("Prin ceață, fiecare pas e o descoperire. Mergi eco.", "EcoPath"),
                ("Ceața ascunde, dar nu oprește. Drumul verde e mereu vizibil.", "EcoPath"),
                ("În ceață, lumea pare nouă. Redescoper-o pe jos.", "EcoPath"),
                ("Misterul ceții te invită să explorezi. Explorează verde.", "EcoPath"),
                ("Când vizibilitatea e redusă, claritatea eco e maximă.", "EcoPath"),
                ("Ceața se ridică, ca și conștiința ta eco. Sus!", "EcoPath"),
                ("Prin ceața dimineții, primul pas verde e cel mai frumos.", "EcoPath"),
                ("Lumea prin ceață e poetică. Călătoria ta eco — epică.", "EcoPath"),
                ("Ceața e doar un voal. Sub el, străbati drumul verde.", "EcoPath"),
                ("Aerul umed, spiritul cald. Transportul public te așteaptă.", "EcoPath")
            }
        };

        /// <summary>
        /// Leader-tier quotes for users with ecoScore >= 500.
        /// Mixed into any weather type to reward high performers.
        /// </summary>
        private static readonly List<(string Text, string Author)> LeaderQuotes = new()
        {
            ("Ești un lider eco. Orașul tău te urmează.", "EcoPath"),
            ("Impactul tău inspiră generații. Continuă drumul verde.", "EcoPath"),
            ("Elite eco — fiecare călătorie a ta schimbă lumea.", "EcoPath"),
            ("Ești printre cei mai buni. Planeta simte diferența.", "EcoPath"),
            ("Legenda eco continuă. Tu scrii următorul capitol.", "EcoPath")
        };
    }
}

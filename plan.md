# PROJE: "Board Export" – Trello Power-Up (Excel Export)

## 0. Rol ve Çalışma Kuralları
Sen deneyimli bir frontend geliştiricisisin. Trello Power-Up'ı olarak çalışan, board'daki kartları seçilen filtre ve kolonlara göre .xlsx dosyası olarak dışa aktaran bir uygulama geliştireceksin.

Kurallar:
- Vanilla HTML + CSS + JavaScript (ES2020) kullan. Framework YOK, build adımı YOK, npm YOK. Statik hosting'de (GitHub Pages / Netlify / Vercel) doğrudan çalışmalı.
- Harici kütüphaneler sadece CDN'den, sabit versiyonla:
  - Trello Power-Up client: https://p.trellocdn.com/power-up.min.js
  - ExcelJS 4.4.0: https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js
- Backend YOK. Tüm veri çekme ve Excel üretimi tarayıcıda yapılır. Board verisi hiçbir üçüncü taraf sunucuya gönderilmez.
- Trello API'lerini tahmin etme. Emin olmadığın her endpoint/parametre için resmi dokümana bak:
  - Power-Up: https://developer.atlassian.com/cloud/trello/power-ups/
  - REST API: https://developer.atlassian.com/cloud/trello/rest/
- Kodu fazlara göre yaz. Her fazın sonunda neyi test etmem gerektiğini kısaca söyle ve bir sonraki faza geçmeden onay bekle.
- UI metinleri İngilizce olacak (ekran görüntüsündeki gibi). Kod yorumları İngilizce.

## 1. Dosya Yapısı
- index.html → Power-Up connector (sadece client.js'i yükler, görünmez)
- export.html → Modal içinde açılan export ekranı
- css/export.css
- js/config.js → APP_KEY, APP_NAME ("Board Export"), APP_AUTHOR sabitleri
- js/client.js → TrelloPowerUp.initialize, board-buttons capability
- js/api.js → Trello REST çağrıları (auth, pagination, rate limit)
- js/columns.js → Kolon tanımları (key, header, default, width, getter fonksiyonu)
- js/filters.js → Liste/etiket/üye/due date filtreleme mantığı
- js/excel.js → ExcelJS ile workbook üretimi
- js/export.js → export.html'in UI controller'ı (state, render, eventler)
- img/icon.svg → Board butonu ikonu (basit, tek renk, gri #42526E)
- README.md → Kurulum adımları (Bölüm 9)

## 2. Power-Up Connector (client.js)
- TrelloPowerUp.initialize ile "board-buttons" capability'si:
  - Buton metni: "Export to Excel", ikon: ./img/icon.svg (mutlak URL üret: window.location.origin + path)
  - Tıklayınca: t.modal({ url: './export.html', title: 'Board Export', fullscreen: false, height: 780 })
- initialize'ın ikinci parametresinde { appKey: APP_KEY, appName: APP_NAME, appAuthor: APP_AUTHOR } ver (REST API yetkilendirmesi için gerekli).
- export.html içinde: const t = TrelloPowerUp.iframe({ appKey, appName, appAuthor });

## 3. Yetkilendirme ve Veri Çekme (api.js)
Power-Up client kütüphanesinin t.cards('all') gibi metodları arşivli kartları, checklist öğelerini ve yorumları vermez. Bu yüzden veri REST API'den çekilecek.

Yetkilendirme akışı:
1. Modal açılınca t.getRestApi().isAuthorized() kontrol et.
2. Yetkili değilse ekranda sadece şu görünsün: kısa açıklama + "Authorize Trello access" butonu. Butona tıklanınca (popup engelleyiciye takılmaması için mutlaka kullanıcı tıklamasıyla) t.getRestApi().authorize({ scope: 'read', expiration: 'never' }).
3. Yetki alındıktan sonra token = await t.getRestApi().getToken(); board id = (await t.board('id')).id
4. Tüm istekler: https://api.trello.com/1/...?key=APP_KEY&token=TOKEN

Çekilecek veriler (paralel olarak Promise.all ile, ama rate limit için aynı anda en fazla 5 istek):
- Board: GET /1/boards/{id}?fields=name,url&labels=all&label_fields=name,color&members=all&member_fields=fullName,username
- Listeler: GET /1/boards/{id}/lists?filter=all&fields=name,closed,pos
- Kartlar: GET /1/boards/{id}/cards/all?fields=name,desc,idList,idLabels,idMembers,start,due,dueComplete,closed,dateLastActivity,shortUrl,url,shortLink,idShort,pos&attachments=true&attachment_fields=name,url,date
  - Dönen kart sayısı 1000 ise "limit=1000&before={en eski kart id}" ile sayfalamaya devam et (dokümandan doğrula).
- Checklistler: GET /1/boards/{id}/checklists?checkItems=all&checkItem_fields=name,state,pos,due,idMember&fields=name,idCard,pos
- Yorumlar: GET /1/boards/{id}/actions?filter=commentCard&limit=1000&fields=data,date,idMemberCreator&memberCreator_fields=fullName
  - 1000 dönerse "before={son action id}" ile sayfala.
  - Yorumlar sadece "Comments" kolonu seçiliyse çekilsin (lazy). Seçim sonradan açılırsa o anda çek ve cache'le.

Genel kurallar:
- Tüm veriyi bir kez çek, bellekte normalize et (Map'ler: listsById, labelsById, membersById, checklistsByCard, commentsByCard). Filtre/kolon değişimlerinde tekrar istek atma.
- HTTP 429 gelirse 1s, 2s, 4s bekleyerek 3 kez tekrar dene.
- 401 gelirse token'ı geçersiz say ve yetkilendirme ekranına dön.
- Yüklenirken spinner + "Loading board data…" göster. Hata durumunda okunabilir hata mesajı + "Retry" butonu.

## 4. Export Ekranı UI (export.html + export.css)
Görsel stil: Trello'nun kendi stiline yakın, sade. Font: -apple-system, "Segoe UI", Roboto, sans-serif. Beyaz kartlar (border-radius 8px, hafif gölge), gri sayfa arka planı (#F1F2F4). Checkbox'lar kutucuk içinde (border 1px #DFE1E6, radius 4px, padding 10px 12px), 4 kolonlu responsive grid. Link rengi #0C66E4.

### 4.1 Kart 1 – Filtreler
**Lists** (başlık solda, sağda "All · None" linkleri)
- Board'daki her liste için bir checkbox, board'daki sırasıyla (pos).
- Varsayılan: tüm açık listeler seçili.
- "Include archived lists and cards" kapalıyken arşivli listeler görünmez. Açılınca arşivli listeler de görünür ve adının yanında gri "(archived)" etiketi olur.

**Only cards with these labels** (yanında gri küçük metin: "(none selected = any)")
- Her etiket için checkbox + renkli nokta (Trello renk adını HEX'e map'le: green, yellow, orange, red, purple, blue, sky, lime, pink, black ve bunların _dark/_light varyantları). Adı boş olan etiketlerde renk adını göster.
- Hiçbiri seçili değilse filtre uygulanmaz. Birden fazla seçiliyse OR mantığı: seçilen etiketlerden en az birine sahip kartlar.

**Only cards with these members** ("(none selected = anyone)")
- Board üyeleri, fullName ile. Aynı OR mantığı.

**Due date** (dropdown) seçenekleri:
- Any (varsayılan)
- Has due date
- No due date
- Overdue (due < şimdi ve dueComplete = false)
- Due in the next 7 days
- Due in the next 30 days
- Marked complete (dueComplete = true)

**Include archived lists and cards** (checkbox, dropdown'un yanında)
- Kapalıyken: arşivli kartlar ve arşivli listelerdeki kartlar hariç.
- Açıkken: hepsi dahil.

### 4.2 Kart 2 – Columns
Başlık solda, sağda "Default · All" linkleri. 4 kolonlu grid, şu sırayla:

| Key | Header | Default | İçerik |
|---|---|---|---|
| list | List | hayır | Liste adı (arşivliyse sonuna " (archived)") |
| card | Card | EVET | Kart adı |
| description | Description | EVET | Kart açıklaması (markdown ham hali) |
| labels | Labels | hayır | Etiket adları, ", " ile birleşik |
| members | Members | hayır | Üye fullName'leri, ", " ile |
| start | Start date | hayır | Tarih (Excel date) |
| due | Due date | hayır | Tarih + saat (Excel date) |
| dueComplete | Due complete | hayır | "Yes" / "No" (due yoksa boş) |
| status | Status | hayır | "Archived" (kart veya listesi arşivliyse), yoksa "Active" |
| checklistProgress | Checklist progress | hayır | "tamamlanan/toplam", ör. "3/5" (checklist yoksa boş) |
| checklistItems | Checklist items | hayır | Her öğe ayrı satırda: "☑ Öğe" veya "☐ Öğe"; birden çok checklist varsa önce "Checklist adı:" satırı |
| comments | Comments | hayır | En yeniden eskiye, her biri ayrı satırda: "YYYY-MM-DD HH:mm – Ad Soyad: metin" |
| attachments | Attachments | hayır | Her ek ayrı satırda: "ad – url" |
| lastActivity | Last activity | EVET | dateLastActivity (Excel date, "yyyy-mm-dd hh:mm") |
| link | Link | EVET | Kartın shortUrl'i, tıklanabilir hyperlink |
| cardId | Card ID | hayır | Kart id'si |

Kolon tanımlarını columns.js'de tek bir dizi olarak tut; hem önizleme hem Excel aynı getter'ları kullansın.

Alt kısımda ince ayırıcı çizgi ve iki seçenek:
- **A sheet for each list** (varsayılan: seçili)
- **A sheet with every checklist item** (varsayılan: seçili değil)

### 4.3 Kart 3 – Preview
- Başlık: "Preview · {kartSayısı} cards in {listeSayısı} lists" (liste sayısı = içinde en az bir kart kalan liste sayısı).
- Sadece seçili kolonlarla bir tablo; ilk 6 kart.
- Hücre metinleri en fazla 2 satır, taşan kısım "…" ile kesilir (CSS line-clamp). Tarihler "YYYY-MM-DD HH:mm" formatında, yerel saatle.
- Altında gri metin: "…and {kalan} more cards."
- Hiç kart yoksa: "No cards match the current filters." ve Download butonu disabled.
- Hiç kolon seçili değilse: "Select at least one column." ve Download butonu disabled.
- Herhangi bir seçim değiştiğinde önizleme anında güncellenir (150ms debounce).

### 4.4 Download Excel butonu
- Önizlemenin altında, sol hizalı, mavi (#0C66E4), beyaz yazı, "Download Excel".
- Tıklanınca buton "Generating…" olur ve disabled; bitince dosya indirilir ve buton eski haline döner.
- Modal iframe içinde indirme için: workbook.xlsx.writeBuffer() → Blob → URL.createObjectURL → görünmez <a download> ile tıklat. Bu iframe'de çalışmazsa alternatif olarak dokümanda önerilen yöntemi araştır ve uygula.

### 4.5 Ayarların hatırlanması
- Kullanıcının son seçimleri (seçili liste id'leri, etiketler, üyeler, due filtresi, archived, kolonlar, iki sheet seçeneği) t.set('board', 'private', 'exportSettings', {...}) ile kaydedilsin ve modal açılınca geri yüklensin.
- Artık var olmayan liste/etiket/üye id'lerini geri yüklerken yok say.
- Board'a sonradan eklenen yeni listeler varsayılan olarak seçili gelsin.

## 5. Filtreleme Mantığı (filters.js)
Bir kart şu koşulların HEPSİNİ sağlıyorsa dahil edilir:
1. Kartın listesi seçili listeler arasında.
2. Archived kapalıysa: kart.closed = false ve listesi closed = false.
3. Etiket filtresi boş değilse: kartın idLabels'ı seçilenlerden en az birini içerir.
4. Üye filtresi boş değilse: kartın idMembers'ı seçilenlerden en az birini içerir.
5. Due date filtresi (Bölüm 4.1'deki tanımlara göre).

Sıralama: önce listelerin board sırası (pos), liste içinde kartların pos değeri.

## 6. Excel Üretimi (excel.js, ExcelJS)
### 6.1 Sheet yapısı
- "A sheet for each list" SEÇİLİYSE: filtre sonrası içinde kart olan her liste için ayrı sheet, board sırasıyla. Sheet adı = liste adı.
- SEÇİLİ DEĞİLSE: tek sheet, adı "Cards", tüm kartlar.
- "A sheet with every checklist item" SEÇİLİYSE: en sona "Checklist Items" sheet'i. Filtreden geçen kartların tüm checklist öğeleri, her öğe bir satır. Kolonlar sabit: List, Card, Checklist, Item, State ("Complete"/"Incomplete"), Item due date, Assigned to, Card link.

### 6.2 Sheet adı kuralları (kritik, Excel bunları reddeder)
- Şu karakterleri kaldır: \ / ? * [ ] :
- Baştaki/sondaki kesme işaretini kaldır.
- En fazla 31 karakter.
- Boşsa "Sheet".
- Büyük/küçük harf duyarsız benzersiz olmalı; çakışırsa sonuna " (2)", " (3)" ekle (31 sınırını koruyarak kırp).
- Türkçe karakterler (ç, ğ, ı, ö, ş, ü, İ) korunmalı.

### 6.3 Biçimlendirme
- Başlık satırı: kalın, beyaz yazı, koyu mavi dolgu (#0C66E4), dikey ortalı, yükseklik 22.
- İlk satır dondurulmuş (freeze pane), başlıkta autoFilter açık.
- Kolon genişlikleri: Card 40, Description 60, Comments 60, Checklist items 50, Attachments 50, Labels 25, Members 25, List 25, tarihler 18, Link 32, Card ID 28, diğerleri 15.
- Çok satırlı metin içeren kolonlarda (Description, Checklist items, Comments, Attachments) wrapText açık, dikey hizalama üst.
- Tarih kolonları gerçek JS Date nesnesi olarak yazılsın (string değil), numFmt "yyyy-mm-dd hh:mm" (Start date için "yyyy-mm-dd").
- Link kolonu: { text: shortUrl, hyperlink: shortUrl }, mavi ve altı çizili.
- Tüm hücre metinlerini 32.000 karakterde kes (Excel'in hücre sınırı 32.767); kesilenlerin sonuna " …[truncated]" ekle.
- Formül enjeksiyonunu önle: "=", "+", "-", "@" ile başlayan metin hücrelerini düz metin olarak yaz (ExcelJS'de string olarak yazıldığı sürece formül olmaz; bunu doğrula).

### 6.4 Dosya adı ve metadata
- "{BoardAdı}_export_{YYYY-MM-DD}.xlsx". Dosya adında geçersiz karakterleri (\ / : * ? " < > |) "_" ile değiştir.
- workbook.creator = "Board Export Power-Up", workbook.created = şimdi.

## 7. Uygulama Fazları
1. **İskelet ve connector:** Dosya yapısı, config.js, client.js, board butonu, boş modal açılıyor.
2. **Yetkilendirme ve veri:** api.js, authorize akışı, tüm verinin çekilip normalize edilmesi, konsolda özet (liste/kart/checklist sayıları).
3. **UI:** Filtre ve kolon kartları, All/None/Default linkleri, archived toggle davranışı.
4. **Filtre + önizleme:** filters.js, columns.js getter'ları, canlı önizleme ve sayaç.
5. **Excel:** excel.js, tüm sheet kuralları, biçimlendirme, indirme.
6. **Kalıcılık ve kenar durumlar:** t.set ile ayarlar, hata ekranları, 429 retry, boş board, 1000+ kart sayfalaması.
7. **README ve son kontrol:** Bölüm 8'deki test listesini tek tek geç.

## 8. Kabul Kriterleri (Test Listesi)
- [ ] Board menüsünde "Export to Excel" butonu var, tıklayınca "Board Export" modalı açılıyor.
- [ ] İlk kullanımda yetkilendirme istiyor; sonraki açılışlarda istemiyor.
- [ ] Listeler board sırasında; All/None çalışıyor.
- [ ] Etiket renkleri doğru; adı boş etiket renk adıyla görünüyor.
- [ ] Etiket ve üye filtresi OR mantığıyla çalışıyor; hiçbiri seçili değilken tüm kartlar geliyor.
- [ ] Her due date seçeneği doğru filtreliyor.
- [ ] Archived kapalıyken arşivli kart/liste yok; açılınca arşivli listeler "(archived)" ile görünüyor ve kartları dahil ediliyor.
- [ ] Önizleme sayacı ve tablo her değişiklikte anında güncelleniyor.
- [ ] Default ve All linkleri doğru kolonları seçiyor.
- [ ] "A sheet for each list" açıkken her listeye bir sheet, kapalıyken tek "Cards" sheet'i.
- [ ] 31 karakterden uzun, özel karakterli veya aynı adlı listeler hatasız sheet'e dönüşüyor.
- [ ] "Checklist Items" sheet'i doğru, her öğe bir satır.
- [ ] Tarihler Excel'de gerçek tarih olarak sıralanabiliyor ve filtrelenebiliyor.
- [ ] Link'ler tıklanabilir.
- [ ] Türkçe karakterler hem sheet adlarında hem hücrelerde bozulmuyor.
- [ ] 500+ kartlık board'da donmadan çalışıyor.
- [ ] Modal kapatılıp açılınca son ayarlar geri geliyor.
- [ ] Dosya Excel, LibreOffice ve Google Sheets'te hatasız açılıyor.

## 9. README – Kurulum Adımları (README.md'ye yaz)
1. Projeyi HTTPS destekli statik bir hosting'e yükle (GitHub Pages, Netlify veya Vercel). Trello sadece HTTPS kabul eder.
2. https://trello.com/power-ups/admin adresinden yeni Power-Up oluştur, Workspace'i seç.
3. "Iframe connector URL" alanına index.html'in tam URL'ini yaz.
4. Capabilities sekmesinde "Board buttons"u aç.
5. "API key" sekmesinden API key üret, js/config.js'teki APP_KEY'e yaz. Aynı ekranda "Allowed origins" listesine hosting domain'ini ekle.
6. Board'da Power-Ups menüsünden "Custom" bölümünde Power-Up'ı ekle.
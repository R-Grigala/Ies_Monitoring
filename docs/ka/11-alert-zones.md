# ალერტის ზონები (Alert Zones)

## 1. დოკუმენტის მიზანი

დოკუმენტი აღწერს ალერტის ზონებს: რუკაზე მონიშნულ polygon-ებს, რომლებიც განსაზღვრავს, რომელ ტერიტორიაზე და რა ML მაგნიტუდის დიაპაზონში მომხდარ მიწისძვრაზე გაიგზავნოს შეტყობინება, ვის და რომელი არხით.

### Implementation Status

| ნაწილი | სტატუსი |
|--------|---------|
| მოდელი `alert_zones` | Implemented |
| REST API `/api/alert_zones` (CRUD) | Implemented |
| GeoJSON Polygon ვალიდაცია | Implemented |
| Web UI `/<lang>/alert_zones`: polygon-ის დახატვა, შექმნა, სია, წაშლა, „რუკაზე" გადამრთველი თითო ზონაზე | Implemented |
| არსებული ზონების რედაქტირება UI-ში | Implemented |
| მოვლენის ზონასთან შედარება (point-in-polygon) და ალერტის გაგზავნა | Planned |

---

## 2. არქიტექტურული მიდგომა

ზონა დამოუკიდებელი ერთეულია. ის არ არის მიბმული კონკრეტულ recipient-ზე: ზონა განსაზღვრავს, **რომელ ჯგუფს** (staff / არა-staff) და **რომელი არხებით** (mail / number / push_notif) გაეგზავნოს შეტყობინება, მიმღებები კი [`07-notification-design.md`](07-notification-design.md)-ში აღწერილი `recips` ცხრილიდან აირჩევა.

```text
Seismic event (lat, lon, ML)
    │
    ▼
alert_zones (enabled = true)
    ├── ML ∈ [min_magnitude, max_magnitude]
    └── (lon, lat) ∈ geometry polygon
            │
            ▼
recips (is_active = true, is_staff = notif_is_staff)
    └── notif_channels → recip_emails / recip_numbers / push
```

ბაზა SQLite (dev) / MySQL (prod) არის, PostGIS-ის გარეშე, ამიტომ polygon ინახება GeoJSON-ად JSON სვეტში. ზონების რაოდენობა მცირეა, ამიტომ point-in-polygon შემოწმება Python-ში ხდება აქტიურ ზონებზე.

---

## 3. მონაცემთა მოდელი

## alert_zones

| ველი | ტიპი | აღწერა |
|------|------|---------|
| id | int | პირველადი გასაღები |
| name | varchar(255) | ზონის სახელი (მაგ. `Tbilisi`) |
| geometry | json | GeoJSON Polygon, კოორდინატები `[lon, lat]` |
| min_magnitude | float | ML მაგნიტუდის ქვედა ზღვარი (ჩათვლით) |
| max_magnitude | float \| null | ML მაგნიტუდის ზედა ზღვარი (ჩათვლით); `null` = ზედა ზღვარი არ არის |
| enabled | boolean | ზონა ჩართულია თუ არა |
| notif_is_staff | boolean | `true` → staff მიმღებები, `false` → არა-staff მიმღებები |
| notif_channels | json | არხების სია: `mail`, `number`, `push_notif` |
| created_at / updated_at | datetime | აუდიტი |
| created_by_user_id / updated_by_user_id | int \| null | აუდიტი (FK → users.id) |

მნიშვნელოვანი:

- ზღვრები **ML** (ლოკალური მაგნიტუდა) მნიშვნელობებია. მოვლენას შეიძლება ჰქონდეს სხვა ტიპის მაგნიტუდებიც (MW, MB...), შედარებისას გამოიყენება მოვლენის ML;
- `geometry` და `notif_channels` JSON სვეტებია: ცვლილებისას ყოველთვის ახალი მნიშვნელობა მიანიჭე (`zone.notif_channels = [...]`), in-place ცვლილება (`.append()`) ბაზაში არ შეინახება.

---

## 4. API Endpoint-ები

### Read (list / detail)

Required permission (any of):

```text
can_recips
can_recips_read
```

Auth: JWT Bearer **ან** service `X-API-Key`.

```http
GET    /api/alert_zones
GET    /api/alert_zones/{id}
```

### Write (create / update / delete)

Required permission:

```text
can_recips
```

```http
POST   /api/alert_zones
PUT    /api/alert_zones/{id}
DELETE /api/alert_zones/{id}
```

Create body მაგალითი:

```json
{
  "name": "Tbilisi",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [44.70, 41.65],
      [44.90, 41.65],
      [44.90, 41.80],
      [44.70, 41.80],
      [44.70, 41.65]
    ]]
  },
  "min_magnitude": 4.0,
  "max_magnitude": 7.0,
  "enabled": true,
  "notif_is_staff": true,
  "notif_channels": ["mail", "push_notif"]
}
```

| ველი | Create | Update (PUT) |
|------|--------|--------------|
| name | სავალდებულო | არასავალდებულო |
| geometry | სავალდებულო | არასავალდებულო |
| min_magnitude | სავალდებულო | არასავალდებულო |
| max_magnitude | არასავალდებულო (default `null`) | არასავალდებულო; `null` ზღვარს მოხსნის |
| enabled | არასავალდებულო (default `true`) | არასავალდებულო |
| notif_is_staff | არასავალდებულო (default `false`) | არასავალდებულო |
| notif_channels | სავალდებულო | არასავალდებულო |

PUT ნაწილობრივი განახლებაა: იცვლება მხოლოდ გაგზავნილი ველები.

Create / Update response:

```json
{
  "message": "Alert zone created successfully.",
  "alert_zone": { "id": 1, "name": "Tbilisi", "geometry": { "...": "..." }, "min_magnitude": 4.0, "max_magnitude": 7.0, "...": "..." }
}
```

List response:

```json
{
  "items": [ { "id": 1, "name": "Tbilisi", "...": "..." } ],
  "total": 1
}
```

Delete response:

```json
{ "message": "Alert zone deleted successfully." }
```

---

## 5. ვალიდაცია

შეცდომისას ბრუნდება `400`:

```json
{ "error": "validation_error", "message": "..." }
```

| ველი | წესი |
|------|------|
| body | უნდა იყოს JSON ობიექტი |
| name | არაცარიელი სტრიქონი, მაქს. 255 სიმბოლო |
| geometry.type | ზუსტად `"Polygon"` |
| geometry.coordinates | არაცარიელი სია რგოლებით; ყოველ რგოლში მინ. 3 განსხვავებული წერტილი |
| წერტილი | `[lon, lat]`, რიცხვები; lon ∈ [-180, 180], lat ∈ [-90, 90] |
| min_magnitude | რიცხვი, ML ∈ [0, 10] |
| max_magnitude | `null` ან რიცხვი, ML ∈ [0, 10], `≥ min_magnitude` |
| enabled / notif_is_staff | boolean |
| notif_channels | არაცარიელი სია, მხოლოდ `mail`, `number`, `push_notif` |

ნორმალიზაცია:

- დაუხურავ რგოლს ავტომატურად ემატება პირველი წერტილი ბოლოში;
- წერტილის მესამე კოორდინატი (სიმაღლე) იშლება, კოორდინატები float-ად ინახება;
- `notif_channels`-ში დუბლიკატები იშლება;
- PUT-ზე `min_magnitude ≤ max_magnitude` მოწმდება ბაზაში არსებულ მნიშვნელობასთანაც (მაგ. მხოლოდ `min_magnitude: 7` გაგზავნა, როცა ბაზაში `max_magnitude = 6`, უარყოფილი იქნება).

სხვა შეცდომები: `401` (ავთენტიფიკაცია), `403` (უფლება არ არის), `404` (`not_found`, ზონა ვერ მოიძებნა).

---

## 6. Web UI

- გვერდი: `/<lang>/alert_zones`, იხსნება `/<lang>/notify`-ზე **Add Alert Zone** ღილაკით.
- რუკა: Leaflet + Leaflet.draw; ჩართულია მხოლოდ polygon-ის ხელსაწყო. ახალი polygon-ის დახატვა ცვლის წინა შეუნახავს; შენახვამდე შესაძლებელია მისი რედაქტირება ან წაშლა toolbar-ით.
- ფორმა: სახელი, მინ. ML / მაქს. ML (ცარიელი მაქს. = ზედა ზღვარი არ არის), არხები (Email / SMS / Push toggle ღილაკები), მიმღებები (გარე / თანამშრომელი), enabled გადამრთველი. იგზავნება `POST /api/alert_zones`, `polygon.toGeoJSON().geometry`-ით.
- შენახული ზონები ჩამოთვლილია სიაში. რუკაზე ნაგულისხმევად არცერთი არ ჩანს — ზონა გამოჩნდება მხოლოდ მაშინ, როცა მის **რუკაზე** გადამრთველს ჩართავ (წითლად; გამორთული ზონა — ნაცრისფერი, წყვეტილი ხაზით). **Delete** ზონას შლის.
- რედაქტირება: ზონაზე ფანქრის ღილაკი მას ფორმაში ტვირთავს (სათაური ხდება „ალერტის ზონის რედაქტირება") და მის polygon-ს რუკაზე რედაქტირებად ფიგურად სვამს; შენახული ასლი ამ დროს იმალება. წვეროების გადაადგილება toolbar-ის edit ხელსაწყოთი ხდება, ან შეიძლება ახალი polygon-ის დახატვა ძველის ნაცვლად. **ცვლილებების შენახვა** აგზავნის `PUT /api/alert_zones/{id}`-ს, **გაუქმება** რედაქტირების რეჟიმიდან გამოდის ცვლილებების გარეშე. არჩევანი არ ინახება და გვერდის განახლებისას ნულდება.
- ნავიგაცია და შეტყობინებები: „მიმღებებზე დაბრუნება" ღილაკი (`.page-back-btn`) აბრუნებს `/<lang>/notify`-ზე; შექმნის / განახლების / წაშლის შედეგები და ვალიდაციის შეცდომები ჩანს მცურავ შეტყობინებად ეკრანის ზედა ნაწილში (იხ. [`09-api-inventory.md`](09-api-inventory.md#საერთო-ui-კომპონენტები)).
- ფაილები: `app/templates/notify/alertZones.html`, `app/static/js/notify/alertZones.js`, route `notify.alert_zones` — `app/views/notify/routes.py`.

---

## 7. უსაფრთხოება

- JWT Authentication **ან** service API key (`X-API-Key`);
- Read: `can_recips` ან `can_recips_read`;
- Write: `can_recips`;
- Audit user ids (`created_by_user_id`, `updated_by_user_id`) ზონის ჩანაწერზე.

---

## 8. მომავალი გაფართოებები (Planned)

- ახალი მოვლენისას ზონების შემოწმება (ML დიაპაზონი + point-in-polygon) და შეტყობინების გაგზავნა შესაბამის მიმღებებზე;
- საჭიროების შემთხვევაში ცალკე permission (მაგ. `can_alert_zones`).

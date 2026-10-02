# post_event.py — დავალება

## მიზანი

დაწერე ფუნქცია, რომელსაც გადავცემთ მიწისძვრის მონაცემებს dict-ის სახით და რომელიც ამ მიწისძვრას თავისი მაგნიტუდებით ამატებს ჩვენს საიტზე ან, თუ უკვე არსებობს, ანახლებს.

### წესები

1. **მაგნიტუდა სავალდებულოა.** თუ `magnitudes` ცარიელია ან არ არის მითითებული, მიწისძვრა **არ** უნდა დაემატოს და ფუნქციამ შეცდომა უნდა ააგდოს.
2. `**seiscomp_oid` სავალდებულოა** და მიწისძვრის უნიკალური იდენტიფიკატორია.
3. **თუ მიწისძვრა ამ** `seiscomp_oid`**-ით უკვე არსებობს, ის განახლდება** (ახალი არ იქმნება). თუ არ არსებობს, შეიქმნება.
4. **ყველაფერი ან არაფერი ახალი მიწისძვრისთვის.** თუ ახალი მიწისძვრა შეიქმნა, მაგრამ რომელიმე მაგნიტუდა ვერ დაემატა, შექმნილი მიწისძვრა უნდა წაიშალოს და ფუნქციამ შეცდომა ააგდოს. საიტზე მაგნიტუდის გარეშე მიწისძვრა არ უნდა დარჩეს.

ფუნქციას სხვა პროგრამა გამოიძახებს, ამიტომ ის არ უნდა ითხოვდეს input-ს, არ უნდა ასრულებდეს პროგრამას (`sys.exit`) და შედეგი უნდა დააბრუნოს.

### ფუნქციის სიგნატურა

```python
def add_event(event: dict) -> dict:
    ...
```

**აბრუნებს:**

```python
{"id": 123, "created": True}   # ახალი მიწისძვრა შეიქმნა
{"id": 123, "created": False}  # არსებული მიწისძვრა განახლდა
```

**შეცდომაზე აგდებს:** `ValueError` (არასწორი მონაცემები, API-ს არაფერი ეგზავნება) ან `ApiError` (API-მ შეცდომა დააბრუნა ან მიუწვდომელია).

### შემავალი dict

```python
event = {
    "iesdata_id": None,
    "seiscomp_oid": public_event_id,
    "origin_time": orgTime,
    "latitude": orgLat,
    "longitude": orgLon,
    "depth": orgDepth,
    "magnitudes": {"ML": 13},
    "location_ge": body_message,  # ქართული ლოკაციის ტექსტი
    "is_automatic": True,
    "area": "local",
}

result = add_event(event)
print("Event:", result["id"], "created" if result["created"] else "updated")
```


| გასაღები       | სავალდებულო | ტიპი / მაგალითი          | შენიშვნა                                            |
| -------------- | ----------- | ------------------------ | --------------------------------------------------- |
| `seiscomp_oid` | **კი**      | `"ies2022xabc"`          | უნიკალური, მაქს. 100 სიმბოლო                        |
| `origin_time`  | **კი**      | `"2022-11-29 23:57:51"`  | UTC; `YYYY-MM-DD HH:MM:SS` ან `YYYY-MM-DDTHH:MM:SS` |
| `latitude`     | **კი**      | `38.79`                  | -90 … 90                                            |
| `longitude`    | **კი**      | `44.88`                  | -180 … 180                                          |
| `magnitudes`   | **კი**      | `{"ML": 4.1, "MW": 3.9}` | მინიმუმ ერთი; ტიპი → მნიშვნელობა                    |
| `depth`        | არა         | `8`                      | კმ; შეიძლება `None`                                 |
| `iesdata_id`   | არა         | `None`                   | უნიკალური, მაქს. 100 სიმბოლო                        |
| `location_ge`  | არა         | `"თბილისიდან 20 კმ"`     | მაქს. 500 სიმბოლო                                   |
| `location_en`  | არა         | `"20 km from Tbilisi"`   | მაქს. 500 სიმბოლო                                   |
| `area`         | არა         | `"local"`                | მაქს. **20** სიმბოლო                                |
| `is_automatic` | არა         | `True` / `False`         | **bool**, არა სტრიქონი                              |


---



## როგორ გადის ეს dict საიტზე — ნაბიჯ-ნაბიჯ

მაგალითისთვის ავიღოთ:

```python
event = {
    "iesdata_id": None,
    "seiscomp_oid": "ies2022xabc",
    "origin_time": "2022-11-29 23:57:51",
    "latitude": 38.79,
    "longitude": 44.88,
    "depth": 8,
    "magnitudes": {"ML": 13},
    "location_ge": "თბილისიდან 20 კმ",
    "is_automatic": True,
    "area": "local",
}
```



### ნაბიჯი 1 — შემოწმება (API-ს ჯერ არაფერი ეგზავნება)

- `seiscomp_oid`, `origin_time`, `latitude`, `longitude` არსებობს ✔
- `magnitudes`-ში მინიმუმ ერთი ჩანაწერია (`ML: 13`) ✔
- `origin_time` სწორი ფორმატისაა, კოორდინატები დიაპაზონშია, `is_automatic` არის bool ✔

თუ რომელიმე ✘-ია → `ValueError` და აქვე ვჩერდებით. საიტზე არაფერი იცვლება.

### ნაბიჯი 2 — dict-ის ორ ნაწილად დაყოფა

API-ს მიწისძვრა და მაგნიტუდები ცალ-ცალკე სჭირდება. ამავე დროს, `None` მნიშვნელობები (`iesdata_id`) არ იგზავნება:

```python
event_payload = {
    "seiscomp_oid": "ies2022xabc",
    "origin_time": "2022-11-29 23:57:51",
    "latitude": 38.79,
    "longitude": 44.88,
    "depth": 8,
    "location_ge": "თბილისიდან 20 კმ",
    "is_automatic": True,
    "area": "local",
}

magnitudes = {"ML": 13.0}
```



### ნაბიჯი 3 — არსებობს თუ არა უკვე ეს მიწისძვრა?

```
POST /api/seismic_events/filter
{"seiscomp_oid": "ies2022xabc"}
```

პასუხის `items`-ში ვეძებთ ჩანაწერს, რომლის `seiscomp_oid == "ies2022xabc"` (ზუსტი დამთხვევა). თუ ასეთი არ არის → ნაბიჯი 4ა; თუ არის → ნაბიჯი 4ბ.

### ნაბიჯი 4ა — თუ არ არსებობს: შექმნა

```
POST /api/seismic_events/
<event_payload>
→ 201 {"event": {"id": 123, ...}}

POST /api/seismic_events/123/magnitudes
{"magnitude_code": "ML", "value": 13.0}
→ 201
```

თუ მაგნიტუდის მოთხოვნამ შეცდომა დააბრუნა:

```
DELETE /api/seismic_events/123
→ ApiError("Event was not added: magnitude ML failed: ...")
```

**შედეგი:** `{"id": 123, "created": True}`

### ნაბიჯი 4ბ — თუ არსებობს (id = 123): განახლება

```
PUT /api/seismic_events/123
<event_payload>
→ 200
```

შემდეგ მაგნიტუდები. ნაპოვნ მიწისძვრას უკვე აქვს:

```json
"magnitudes": [{"id": 55, "value": 12.0, "magnitude": {"code": "ML"}}]
```

`ML` უკვე არსებობს, ამიტომ მისი მნიშვნელობა ნახლდება:

```
PUT /api/seismic_events/magnitudes/55
{"value": 13.0}
→ 200
```

`ML` რომ არ ჰქონოდა, გაიგზავნებოდა `POST /api/seismic_events/123/magnitudes`.

**შედეგი:** `{"id": 123, "created": False}`

### რა ჩანს საიტზე

**Events** გვერდზე ერთი მიწისძვრაა (`2022-11-29 23:57:51`, `38.79, 44.88`, სიღრმე `8`), დეტალებში კი `ML 13`, ლოკაცია `თბილისიდან 20 კმ` და area `local`. რამდენჯერაც არ უნდა გაიგზავნოს იგივე `seiscomp_oid`, მიწისძვრა ერთი დარჩება და მხოლოდ მისი მონაცემები განახლდება.

---



## API-ის მოკლე აღწერა

ავტორიზაცია ყველა მოთხოვნაში header-ით ხდება:

```
X-API-Key: ies_...
```

სერვისს უნდა ჰქონდეს უფლება `can_event_edit`, წინააღმდეგ შემთხვევაში API აბრუნებს **403**-ს. API-ის სრული აღწერა ნახე Swagger-ზე: `http://localhost:5000/docs/`.

> **მნიშვნელოვანია:** API-ს არ აქვს ერთი endpoint, რომელიც „შექმნის ან განაახლებს“. მიწისძვრის შექმნა მაგნიტუდის გარეშეც შეიძლება, ხოლო არსებული `seiscomp_oid`-ით შექმნისას API აბრუნებს **409**-ს და არაფერს ანახლებს. ზემოთ ჩამოთვლილი წესები **შენმა ფუნქციამ** უნდა უზრუნველყოს ქვემოთ მოცემული endpoint-ების კომბინაციით.

მიწისძვრა და მაგნიტუდები **სხვადასხვა მოთხოვნით** იქმნება. მიწისძვრის შექმნა/განახლება `magnitudes` ველს არ იღებს, ამიტომ ის dict-იდან უნდა ამოიღო და ცალკე დაამუშაო.

### 1) მიწისძვრის მოძებნა `seiscomp_oid`-ით

`POST /api/seismic_events/filter`, body: `{"seiscomp_oid": "ies2022xabc"}`

- **200** — `{"items": [ {...მიწისძვრა...}, ... ], "total": N}`

⚠️ ფილტრი ეძებს **ნაწილობრივ დამთხვევას** (`ies2022` იპოვის `ies2022xabc`-საც და `ies2022xabd`-საც). ამიტომ შედეგებიდან აიღე მხოლოდ ის, რომლის `seiscomp_oid` **ზუსტად** ემთხვევა.

ნაპოვნ მიწისძვრას აქვს `magnitudes` სია:

```json
"magnitudes": [
  {"id": 55, "value": 4.1, "magnitude": {"id": 1, "code": "ML", ...}}
]
```

აქ `id` (55) არის **მიწისძვრის მაგნიტუდის** id; ის მაგნიტუდის განახლებისთვის დაგჭირდება.

### 2) მიწისძვრის შექმნა

`POST /api/seismic_events/`, body — JSON: მონაცემები `**magnitudes`-ის გარეშე** და `None` მნიშვნელობების გარეშე.

- **201** — `{"message": "...", "event": {"id": 123, ...}}`
- **400** — ვალიდაციის შეცდომა
- **409** — `seiscomp_oid` ან `iesdata_id` უკვე არსებობს



### 3) მიწისძვრის განახლება

`PUT /api/seismic_events/<event_id>`, body — იგივე, რაც შექმნისას (`magnitudes`-ის გარეშე).

- **200** — `{"message": "...", "event": {...}}`
- **404** — მიწისძვრა ვერ მოიძებნა
- **409** — `iesdata_id` სხვა მიწისძვრას ეკუთვნის

`None` ველები API-ში იგნორირდება: ისინი არსებულ მნიშვნელობას არ შლის.

### 4) მაგნიტუდის დამატება

`POST /api/seismic_events/<event_id>/magnitudes`, body: `{"magnitude_code": "ML", "value": 13}`

- **201** — წარმატება
- **404** — მიწისძვრა ან მაგნიტუდის ტიპი ვერ მოიძებნა
- **409** — ამ ტიპის მაგნიტუდა ამ მიწისძვრას უკვე აქვს



### 5) მაგნიტუდის განახლება

`PUT /api/seismic_events/magnitudes/<event_magnitude_id>`, body: `{"value": 4.3}`

- **200** — წარმატება
- **404** — ვერ მოიძებნა



### 6) მიწისძვრის წაშლა (rollback-ისთვის)

`DELETE /api/seismic_events/<event_id>` → **200**

ბაზაში არსებული მაგნიტუდის ტიპები: `ML`, `MB`, `MS`, `MD`, `MW`, `K`, `MPV`, `MLH`, `MC`, `MLV`, `M` (რეგისტრს მნიშვნელობა არ აქვს).

---



## ეტაპი 1 — კონფიგურაცია

1. API key წაიკითხე env ცვლადიდან `IES_API_KEY`; **კოდში key არ უნდა ეწეროს**.
2. API-ის მისამართი წაიკითხე env ცვლადიდან `IES_API_URL`, default: `http://localhost:5000`.
3. ფაილის თავში კონსტანტები: `BASE_URL`, `API_KEY`, `TIMEOUT = 30`.
4. ძველი key და `main()` ფუნქცია წაშალე.

---



## ეტაპი 2 — HTTP მოთხოვნის დამხმარე ფუნქცია

ყველა მეთოდს (`POST`, `PUT`, `DELETE`) ერთნაირი დამუშავება სჭირდება, ამიტომ დაწერე ერთი დამხმარე ფუნქცია:

```python
class ApiError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def _request(method, path, payload=None) -> dict:
    ...
```

`_request` უნდა:

1. გაგზავნოს `requests.request(method, url, json=payload, headers=..., timeout=TIMEOUT)`;
2. სცადოს `response.json()`, ხოლო თუ პასუხი JSON არ არის (მაგ. 500-ზე HTML), გამოიყენოს ცარიელი dict;
3. თუ `response.ok` არის `False`, ააგდოს `ApiError` (სტატუსით), რომლის ტექსტში ჩანს მეთოდი, path, HTTP სტატუსი და API-ის `message`;
4. 401-ზე და 403-ზე ტექსტი იყოს გასაგები: „API key არასწორია“, „სერვისს არ აქვს can_event_edit უფლება“;
5. თუ სერვერი მიუწვდომელია (`requests.RequestException`), ესეც `ApiError`-ად გადააკეთოს: `Could not reach API: ...`;
6. წარმატებისას დააბრუნოს JSON.

---



## ეტაპი 3 — მონაცემების შემოწმება

გაგზავნამდე შეამოწმე dict. თუ რამე არასწორია, ააგდე `ValueError` გასაგები ტექსტით და API-ს **არაფერი** გაუგზავნო.

- `seiscomp_oid`, `origin_time`, `latitude`, `longitude` — აუცილებლად უნდა არსებობდეს და არ იყოს `None` ან ცარიელი;
- `**magnitudes` — აუცილებლად dict მინიმუმ ერთი ჩანაწერით**; ცარიელზე ან არარსებულზე ტექსტი: `"Event must have at least one magnitude."`;
- `magnitudes`-ის ყოველი მნიშვნელობა `float`-ად გადაყვანადი;
- `origin_time` — `datetime.fromisoformat(...)` უნდა გაიაროს;
- `latitude`, `longitude` — `float`-ად გადაყვანადი და დიაპაზონში;
- `depth` — `None` ან `float`-ად გადაყვანადი;
- `is_automatic` — თუ მითითებულია, უნდა იყოს `bool`;
- `area` — მაქს. 20 სიმბოლო; 
- `location_ge` / `location_en` — მაქს. 500;
- უცნობი გასაღები (მაგ. ბეჭდვის შეცდომა `"lattitude"`) → `ValueError`.

**მინიშნება:** შემავალი dict **არ** შეცვალო (`pop`-ით და ა.შ.), ააწყე ახალი.

**შემოწმება:**

- [ ] `"magnitudes": {}` → `ValueError`, API-ს არაფერი ეგზავნება, საიტზე არაფერი ჩნდება.
- [ ] `magnitudes`-ის გარეშე → `ValueError`.
- [ ] `seiscomp_oid`-ის გარეშე → `ValueError`.
- [ ] `"latitude": 120` → `ValueError`.
- [ ] `"is_automatic": "True"` (სტრიქონი) → `ValueError`.
- [ ] `"magnitudes": {"ML": "abc"}` → `ValueError`.

---



## ეტაპი 4 — არსებული მიწისძვრის მოძებნა

დაწერე ფუნქცია:

```python
def find_event_by_oid(seiscomp_oid) -> dict | None:
    ...
```

1. `_request("POST", "/api/seismic_events/filter", {"seiscomp_oid": seiscomp_oid})`.
2. `items`-იდან დააბრუნე ის, რომლის `seiscomp_oid` **ზუსტად** ემთხვევა; თუ არც ერთი — `None`.

**შემოწმება:**

- [ ] არსებულ `seiscomp_oid`-ზე აბრუნებს მიწისძვრას (მისი `magnitudes`-ით).
- [ ] არარსებულზე აბრუნებს `None`-ს.
- [ ] თუ ბაზაში არის `abc123` და ეძებ `abc`-ს → `None` (ნაწილობრივი დამთხვევა არ ითვლება).

---



## ეტაპი 5 — `add_event` ფუნქცია

```
1. შეამოწმე მონაცემები (ეტაპი 3)          → არასწორზე ValueError
2. ააწყე payload (magnitudes-ის და None-ების გარეშე)
3. existing = find_event_by_oid(seiscomp_oid)

4ა. თუ existing არ არის — ახალი მიწისძვრა:
    - POST /api/seismic_events/        → event_id
    - ყოველი მაგნიტუდისთვის POST .../magnitudes
    - თუ რომელიმე მაგნიტუდა ვერ დაემატა:
        DELETE /api/seismic_events/<event_id>
        ააგდე ApiError ("Event was not added: magnitude ML failed: ...")
    - დააბრუნე {"id": event_id, "created": True}

4ბ. თუ existing არის — განახლება:
    - PUT /api/seismic_events/<existing id>  payload-ით
    - ყოველი მაგნიტუდისთვის:
        თუ ეს ტიპი (code) უკვე აქვს existing["magnitudes"]-ში
            → PUT /api/seismic_events/magnitudes/<event_magnitude_id>  {"value": ...}
        თუ არ აქვს
            → POST /api/seismic_events/<id>/magnitudes
    - თუ რომელიმე ვერ განახლდა → ააგდე ApiError (ჩამოთვალე, რომელი)
    - დააბრუნე {"id": id, "created": False}
```

**დეტალები:**

- მაგნიტუდის ტიპები შეადარე რეგისტრის გარეშე: `"ml"` და `"ML"` ერთი და იგივეა (`.upper()`).
- განახლებისას მაგნიტუდები, რომლებიც საიტზე არის, მაგრამ ახალ dict-ში არ არის, **არ** წაშალო. ისინი შეიძლება ხელით იყოს დამატებული.
- rollback-ის (DELETE) შეცდომაც დაიჭირე: თუ წაშლაც ვერ მოხერხდა, `ApiError`-ის ტექსტში მიუთითე, რომ მიწისძვრა #ID საიტზე მაგნიტუდის გარეშე დარჩა და ხელით უნდა წაიშალოს.

**შემოწმება:**

- [ ] ახალი `seiscomp_oid` + `{"ML": 13}` → `{"id": ..., "created": True}`; საიტზე ჩანს მიწისძვრა და `ML 13`.
- [ ] იგივე `seiscomp_oid`, შეცვლილი `depth` და `{"ML": 4.5}` → `{"created": False}`, იგივე `id`; საიტზე შეცვლილია სიღრმე და `ML 4.5`; **ახალი მიწისძვრა არ შექმნილა**.
- [ ] იგივე `seiscomp_oid` + `{"ML": 4.5, "MW": 4.2}` → ML განახლდა, MW დაემატა.
- [ ] ახალი `seiscomp_oid` + `{"XX": 3.0}` (არარსებული ტიპი) → `ApiError`; **საიტზე მიწისძვრა არ ჩანს** (rollback-მა იმუშავა).
- [ ] ახალი `seiscomp_oid` + `{"ML": 4.1, "XX": 3.0}` → `ApiError`; საიტზე მიწისძვრა არ ჩანს.
- [ ] Flask აპი გათიშული → `ApiError: Could not reach API: ...`.
- [ ] გამოძახების შემდეგ შემავალ dict-ში `magnitudes` ისევ არსებობს (dict არ შეცვლილა).

---



## ეტაპი 6 — ხელით ტესტი

ფაილის ბოლოს დაამატე ბლოკი, რომელიც სრულდება მხოლოდ ფაილის პირდაპირ გაშვებისას (`python post_event.py`) და **არა** import-ისას:

```python
if __name__ == "__main__":
    # ხელით ტესტისთვის:
    test_event = {
        "iesdata_id": None,
        "seiscomp_oid": "ies2026ercx",
        "origin_time": "2022-11-29 23:57:51",
        "latitude": 38.79,
        "longitude": 44.88,
        "depth": 8,
        "magnitudes": {"ML": 5},
        "location_ge": "სატესტო ლოკაცია",
        "is_automatic": True,
        "area": "local",
    }

    ...  # გამოიძახე add_event და დაბეჭდე შედეგი; ApiError / ValueError დაიჭირე და დაბეჭდე
```

**შემოწმება:**

- [ ] `python -c "import services.post_event.post_event"` ბაზაში არაფერს ქმნის.
- [ ] პირველი გაშვება → `created`; მეორე გაშვება → `updated`, იგივე `id`, საიტზე ერთი მიწისძვრაა.

---



## საერთო წესები

- საიდუმლო ინფორმაცია (key, პაროლი, token) **არასდროს** ჩაწერო კოდში.
- ყველა HTTP მოთხოვნას უნდა ჰქონდეს `timeout`.
- ყველა HTTP პასუხის სტატუსი უნდა შემოწმდეს, სანამ მის შიგთავსს გამოიყენებ.
- ფუნქცია არ უნდა იძახებდეს `sys.exit()`-ს; შეცდომაზე exception უნდა ააგდოს.
- სახელები `snake_case`-ით, ორმაგი ბრჭყალები, PEP 8.



## ჩაბარება

გახსენი Pull Request. აღწერაში ჩასვი:

1. „შემოწმების“ პუნქტების შედეგები (ტერმინალის output);
2. screenshot-ები საიტიდან: ახლად შექმნილი მიწისძვრა და იგივე მიწისძვრა განახლების შემდეგ (შეცვლილი მნიშვნელობებით).


// Monitoring API (Ies_Monitoring) — set these for the service that has
// can_event_edit + can_event_publish (and can_event_view for lookup).

// Iesdata-ზე არსებულ სკრიპტში უნდა ჩაკოპირდეს ეს ფუნქციები, რომ იმუშაოს.
// დამატებული ფუნქციები მიწისძვრის გამოქვეყნების დროს მივა IesMonitoring-ზე დაამატებს მიწისძვრას და შემდგომ გამოაქვეყნებს.
// ასევე გამოქვეყნების წაშლის დროს მივა IesMonitoring-ზე და წაიშლება მიწისძვრა.

// მთავარი ფუნქციებია unpublishViaMonitoring() და syncAndPublishViaMonitoring(). დანარჩენი დამხმარე ფუნქციებია.

// IesMonitoring-ის მისამართი
var MONITORING_API_BASE = "https://example.com/api";
// IesMonitoring-ის სერვისის API კოდი (სერვისს უნდა გააჩნდეს can_event_edit და can_event_publish უფლებები)
var MONITORING_API_KEY = "example_api_key1234";

function monitoringHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-API-Key": MONITORING_API_KEY,
  };
}

function toMonitoringOriginTime(value) {
  if (!value) return null;
  var text = String(value).trim().replace(" ", "T");
  // Drop trailing fractional seconds if present (e.g. .000)
  if (text.indexOf(".") !== -1) {
    text = text.split(".")[0];
  }
  return text;
}

function buildMonitoringEventPayload() {
  var isAutomatic =
    $("#eqTimeHypocenterProgram").val().substring(0, 9) == "Automatic";
  return {
    origin_time: toMonitoringOriginTime($("#eqOriginTime").val()),
    latitude: parseFloat($("#eqLatitude").val()),
    longitude: parseFloat($("#eqLongitude").val()),
    depth: parseFloat($("#eqDepth").val()),
    iesdata_id: parseInt(eq_id, 10),
    location_ge: $("#eqRegion_ge").val() || "",
    location_en: $("#eqRegion_en").val() || "",
    is_automatic: isAutomatic,
  };
}

function findMonitoringEventByIesdataId(done, fail) {
  $.ajax({
    url: MONITORING_API_BASE + "/seismic_events/iesdata_id=" + parseInt(eq_id, 10),
    method: "GET",
    headers: monitoringHeaders(),
    success: function (response) {
      done(response || null);
    },
    error: function (jqXHR, exception) {
      if (jqXHR && jqXHR.status === 404) {
        done(null);
        return;
      }
      console.log("monitoring lookup failed:", exception, jqXHR && jqXHR.responseText);
      if (fail) fail(jqXHR, exception);
    },
  });
}

// Iesdata-ს ამ მიწისძვრის ყველა მაგნიტუდა: [{ code: "ml", value: "3.4" }, ...]
// იკითხება eqMagnitudesTable ცხრილიდან, ისევე როგორც updateEqMagnitudesArrayFromTable():
// მაგნიტუდის რიგები იწყება მე-2 ინდექსიდან, ბოლო რიგი "დამატების" რიგია;
// row.id მაგნიტუდის ტიპია, მნიშვნელობა კი #eqMag<ტიპი>Value ველშია.
function collectIesdataMagnitudes() {
  var table = document.getElementById("eqMagnitudesTable");
  if (!table) return [];
  var items = [];
  for (var i = 2; i < table.rows.length - 1; i++) {
    var code = table.rows[i].id;
    var input = document.getElementById("eqMag" + code + "Value");
    if (code && input && input.value !== "") {
      items.push({ code: code, value: input.value });
    }
  }
  return items;
}

function validMonitoringMagnitudes() {
  var seen = {};
  return collectIesdataMagnitudes()
    .map(function (item) {
      return { code: String(item.code || "").trim().toUpperCase(), value: parseFloat(item.value) };
    })
    .filter(function (item) {
      // Monitoring keeps one value per magnitude type, so the first one wins.
      if (!item.code || isNaN(item.value) || seen[item.code]) return false;
      seen[item.code] = true;
      return true;
    });
}

// Adds the magnitude types the event doesn't have yet and updates changed values.
// Magnitudes that exist only on Monitoring are left untouched.
function ensureMonitoringMagnitudes(eventId, done, fail) {
  var wanted = validMonitoringMagnitudes();
  if (!wanted.length) {
    done(eventId);
    return;
  }
  $.ajax({
    url: MONITORING_API_BASE + "/seismic_events/event_id=" + eventId,
    method: "GET",
    headers: monitoringHeaders(),
    success: function (event) {
      var existingByCode = {};
      ((event && event.magnitudes) || []).forEach(function (item) {
        if (item.magnitude && item.magnitude.code) {
          existingByCode[item.magnitude.code.toUpperCase()] = item;
        }
      });

      var index = 0;
      function next() {
        if (index >= wanted.length) {
          done(eventId);
          return;
        }
        var item = wanted[index++];
        var existing = existingByCode[item.code];
        if (existing && existing.value === item.value) {
          next();
          return;
        }
        $.ajax({
          url: existing
            ? MONITORING_API_BASE + "/seismic_events/magnitudes/" + existing.id
            : MONITORING_API_BASE + "/seismic_events/" + eventId + "/magnitudes",
          method: existing ? "PUT" : "POST",
          headers: monitoringHeaders(),
          data: JSON.stringify(
            existing ? { value: item.value } : { magnitude_code: item.code, value: item.value }
          ),
          success: next,
          error: function (jqXHR, exception) {
            // 404: this type is not in Monitoring's magnitude catalog; keep the others.
            if (!existing && jqXHR && jqXHR.status === 404) {
              console.log("monitoring magnitude " + item.code + " skipped:", jqXHR.responseText);
              next();
              return;
            }
            console.log(
              "monitoring magnitude " + item.code + " failed:",
              exception,
              jqXHR && jqXHR.responseText
            );
            if (fail) fail(jqXHR, exception);
          },
        });
      }
      next();
    },
    error: function (jqXHR, exception) {
      console.log("monitoring event reload failed:", exception, jqXHR && jqXHR.responseText);
      if (fail) fail(jqXHR, exception);
    },
  });
}

function ensureMonitoringBeachball(eventId, hasBeachball, done) {
  var strike = moment_tensor && moment_tensor["strike1"];
  var dip = moment_tensor && moment_tensor["dip1"];
  var rake = moment_tensor && moment_tensor["rake1"];
  if (
    strike === undefined ||
    strike === null ||
    strike === "" ||
    dip === undefined ||
    dip === null ||
    dip === "" ||
    rake === undefined ||
    rake === null ||
    rake === ""
  ) {
    done(eventId);
    return;
  }
  var payload = {
    strike: parseFloat(strike),
    dip: parseFloat(dip),
    rake: parseFloat(rake),
  };
  $.ajax({
    url: MONITORING_API_BASE + "/seismic_events/" + eventId + "/beachball",
    method: hasBeachball ? "PUT" : "POST",
    headers: monitoringHeaders(),
    data: JSON.stringify(payload),
    success: function () {
      done(eventId);
    },
    error: function (jqXHR) {
      // A failed beachball must not block publishing the earthquake itself.
      console.log("monitoring beachball failed:", jqXHR && jqXHR.responseText);
      done(eventId);
    },
  });
}

function publishMonitoringEvent(eventId) {
  $.ajax({
    url: MONITORING_API_BASE + "/publish_events/publish/" + eventId,
    method: "POST",
    headers: monitoringHeaders(),
    success: function (response) {
      console.log("monitoring publish ok:", response);
    },
    error: function (jqXHR, exception) {
      console.log("monitoring publish failed:", exception, jqXHR && jqXHR.responseText);
    },
  });
}

function syncAndPublishViaMonitoring() {
  var payload = buildMonitoringEventPayload();

  function syncDetailsAndPublish(eventId, hasBeachball) {
    ensureMonitoringMagnitudes(eventId, function (id) {
      ensureMonitoringBeachball(id, hasBeachball, publishMonitoringEvent);
    });
  }

  // Look up first, so an existing earthquake is updated instead of failing a create with 409.
  findMonitoringEventByIesdataId(function (existing) {
    if (existing && existing.id) {
      $.ajax({
        url: MONITORING_API_BASE + "/seismic_events/event_id=" + existing.id,
        method: "PUT",
        headers: monitoringHeaders(),
        data: JSON.stringify(payload),
        success: function () {
          syncDetailsAndPublish(existing.id, Boolean(existing.beachball));
        },
        error: function (jqXHR, exception) {
          // Don't publish stale data when the update was rejected.
          console.log("monitoring update failed:", exception, jqXHR && jqXHR.responseText);
        },
      });
      return;
    }

    $.ajax({
      url: MONITORING_API_BASE + "/seismic_events/",
      method: "POST",
      headers: monitoringHeaders(),
      data: JSON.stringify(payload),
      success: function (response) {
        var eventId = response && response.event && response.event.id;
        if (!eventId) {
          console.log("monitoring create: missing event id", response);
          return;
        }
        syncDetailsAndPublish(eventId, false);
      },
      error: function (jqXHR, exception) {
        console.log("monitoring create failed:", exception, jqXHR && jqXHR.responseText);
      },
    });
  });
}

function unpublishViaMonitoring() {
  findMonitoringEventByIesdataId(function (existing) {
    if (!existing || !existing.id) {
      console.log(
        "monitoring unpublish skipped: no event with iesdata_id=",
        eq_id
      );
      return;
    }
    if (!existing.is_published) {
      console.log(
        "monitoring unpublish skipped: event",
        existing.id,
        "is not published"
      );
      return;
    }
    $.ajax({
      url: MONITORING_API_BASE + "/publish_events/unpublish/" + existing.id,
      method: "POST",
      headers: monitoringHeaders(),
      success: function (response) {
        console.log("monitoring unpublish ok:", response);
      },
      error: function (jqXHR, exception) {
        console.log(
          "monitoring unpublish failed:",
          exception,
          jqXHR && jqXHR.responseText
        );
      },
    });
  });
}



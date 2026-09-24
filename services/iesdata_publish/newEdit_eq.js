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
    iesdata_id: String(eq_id),
    location_ge: $("#eqRegion_ge").val() || "",
    location_en: $("#eqRegion_en").val() || "",
    is_automatic: isAutomatic,
  };
}

function findMonitoringEventByIesdataId(done, fail) {
  $.ajax({
    url: MONITORING_API_BASE + "/seismic_events/filter",
    method: "POST",
    headers: monitoringHeaders(),
    data: JSON.stringify({ iesdata_id: String(eq_id) }),
    success: function (response) {
      var items = (response && response.items) || [];
      var match = null;
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].iesdata_id) === String(eq_id)) {
          match = items[i];
          break;
        }
      }
      done(match);
    },
    error: function (jqXHR, exception) {
      console.log("monitoring lookup failed:", exception, jqXHR && jqXHR.responseText);
      if (fail) fail(jqXHR, exception);
    },
  });
}

function ensureMonitoringMagnitude(eventId, done, fail) {
  var mags = choose_mag();
  if (!mags || mags["mag"] === undefined || mags["mag"] === null || mags["mag"] === "") {
    done(eventId);
    return;
  }
  $.ajax({
    url: MONITORING_API_BASE + "/seismic_events/" + eventId + "/magnitudes",
    method: "POST",
    headers: monitoringHeaders(),
    data: JSON.stringify({
      magnitude_code: mags["mag_type"] || "ML",
      value: parseFloat(mags["mag"]),
    }),
    success: function () {
      done(eventId);
    },
    error: function (jqXHR, exception) {
      // 409 = magnitude type already on event — still publishable
      if (jqXHR && jqXHR.status === 409) {
        done(eventId);
        return;
      }
      console.log("monitoring magnitude failed:", exception, jqXHR && jqXHR.responseText);
      if (fail) fail(jqXHR, exception);
    },
  });
}

function ensureMonitoringBeachball(eventId, done) {
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
    method: "POST",
    headers: monitoringHeaders(),
    data: JSON.stringify(payload),
    success: function () {
      done(eventId);
    },
    error: function (jqXHR) {
      if (jqXHR && jqXHR.status === 409) {
        $.ajax({
          url: MONITORING_API_BASE + "/seismic_events/" + eventId + "/beachball",
          method: "PUT",
          headers: monitoringHeaders(),
          data: JSON.stringify(payload),
          complete: function () {
            done(eventId);
          },
        });
        return;
      }
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
      ensureMonitoringMagnitude(eventId, function (id) {
        ensureMonitoringBeachball(id, publishMonitoringEvent);
      });
    },
    error: function (jqXHR, exception) {
      // Already in our DB — look up by iesdata_id, update, then publish.
      if (jqXHR && jqXHR.status === 409) {
        findMonitoringEventByIesdataId(function (existing) {
          if (!existing || !existing.id) {
            console.log("monitoring: conflict but event not found for iesdata_id=", eq_id);
            return;
          }
          var eventId = existing.id;
          $.ajax({
            url: MONITORING_API_BASE + "/seismic_events/" + eventId,
            method: "PUT",
            headers: monitoringHeaders(),
            data: JSON.stringify(payload),
            complete: function () {
              ensureMonitoringMagnitude(eventId, function (id) {
                ensureMonitoringBeachball(id, publishMonitoringEvent);
              });
            },
          });
        });
        return;
      }
      console.log("monitoring create failed:", exception, jqXHR && jqXHR.responseText);
    },
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



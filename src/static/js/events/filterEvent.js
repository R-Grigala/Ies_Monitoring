// Send POST request for filter event
function filterEventForm(event) {
    event.preventDefault(); // Prevent default form submission

    const form = document.getElementById('eventFilterForm');
    const formData = new FormData(form);

    // Retrieve JWT token
    const token = localStorage.getItem('access_token');
    console.log("filter formData:", Object.fromEntries(formData.entries()));

    // makeApiRequest is a utility function defined elsewhere
    makeApiRequest('/api/filter_event', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}` // Include JWT token in the Authorization header
        },
        body: formData
    })
    .then(data => {
        if (!Array.isArray(data) || data.length === 0) {
            eventTableBody.innerHTML = "";
            eventStatus.textContent = "ივენთები ვერ მოიძებნა.";
            return;
          }
        // Clear old project table data
        const eventsTableBody = document.getElementById('eventsTableBody');
        eventsTableBody.innerHTML = ''; // Clear previous data

        const sortedEvents = [...data].sort((a, b) => {
            const aTime = new Date(a.origin_time || 0).getTime();
            const bTime = new Date(b.origin_time || 0).getTime();
            return bTime - aTime;
        });
        console.log(sortedEvents);
        window.eventsById.clear();
        sortedEvents.forEach((event) => window.eventsById.set(String(event.event_id), event));
        window.eventsById = window.eventsById;
        
        eventsTableBody.innerHTML = sortedEvents
            .map(
              (event) => `
              <tr>
                <td>
                  <div class="d-flex align-items-center gap-1">
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-secondary edit-event-btn d-inline-flex align-items-center justify-content-center"
                      onclick="openEditEventModal('${escapeHtml(event.event_id)}')"
                      title="ივენთის რედაქტირება"
                      aria-label="ივენთის რედაქტირება"
                    >
                      <img
                        src="/static/img/pen-solid.svg"
                        alt="რედაქტირება"
                        style="width: 14px; height: 14px;"
                      >
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center"
                      onclick="deleteEvent('${escapeHtml(event.event_id)}')"
                      title="ივენთის წაშლა"
                      aria-label="ივენთის წაშლა"
                    >
                      <img
                        src="/static/img/trash-solid.svg"
                        alt="წაშლა"
                        style="width: 14px; height: 14px;"
                      >
                    </button>
                  </div>
                </td>
                <td>${escapeHtml(event.event_id)}</td>
                <td>${escapeHtml(event.seiscomp_oid)}</td>
                <td>${escapeHtml(event.origin_time)}</td>
                <td>${escapeHtml(event.ml)}</td>
                <td>${escapeHtml(event.depth)}</td>
                <td>${escapeHtml(event.latitude)}</td>
                <td>${escapeHtml(event.longitude)}</td>
                <td>${escapeHtml(event.region_ge || event.region_en || event.area || "-")}</td>
              </tr>
            `
            )
            .join("");
        
          eventsStatus.textContent = `ჩაიტვირთა ${sortedEvents.length} მიწისძვრა.`;
    })
    .catch(error => {
        console.error('Error fetching project data:', error);
    });

}
window.deleteEvent = async function deleteEvent(eventId) {
  const confirmationMessage = `ნამდვილად გინდა ივენთის წაშლა? (event_id: ${eventId})`;
  const confirmed = window.showConfirmModal
    ? await window.showConfirmModal({
        title: "ივენთის წაშლა",
        message: confirmationMessage,
        confirmText: "წაშლა",
        cancelText: "გაუქმება",
        confirmClass: "btn-danger",
      })
    : window.confirm(confirmationMessage);

  if (!confirmed) {
    return;
  }

  const apiKey = window.getApiKey ? window.getApiKey() : null;
  if (!apiKey) {
    showAlert("alertPlaceholder", "danger", "API key აუცილებელია ივენთის წაშლისთვის.");
    return;
  }

  const data = await makeApiRequest(`/api/events/${Number(eventId)}`, {
    method: "DELETE",
    headers: {
      accept: "application/json",
      "X-API-Key": apiKey,
    },
  });

  if (!data || data.error) {
    showAlert("alertPlaceholder", "danger", data?.error || "ივენთის წაშლა ვერ მოხერხდა.");
    return;
  }

  showAlert("alertPlaceholder", "success", data.message || "ივენთი წარმატებით წაიშალა.");
  if (window.loadEvents) {
    await window.loadEvents();
  }
};

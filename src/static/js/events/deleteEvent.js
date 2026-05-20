window.deleteEvent = async function deleteEvent(eventId) {
  if (
    typeof window.requireEventsAuth === "function" &&
    !(await Promise.resolve(window.requireEventsAuth("Delete event")))
  ) {
    return;
  }
  const confirmationMessage = `Are you sure you want to delete this event? (event_id: ${eventId})`;
  const confirmed = window.showConfirmModal
    ? await window.showConfirmModal({
        title: "Delete event",
        message: confirmationMessage,
        confirmText: "Delete",
        cancelText: "Cancel",
        confirmClass: "btn-danger",
      })
    : window.confirm(confirmationMessage);

  if (!confirmed) {
    return;
  }

  const data = await window.makeApiRequest(`/api/events/${Number(eventId)}`, {
    method: "DELETE",
    headers: {
      accept: "application/json",
    },
  });

  if (!data || data.error) {
    showAlert("alertPlaceholder", "danger", data?.error || "Failed to delete event.");
    return;
  }

  showAlert("alertPlaceholder", "success", data.message || "Event deleted successfully.");
  if (window.loadEvents) {
    await window.loadEvents();
  }
};

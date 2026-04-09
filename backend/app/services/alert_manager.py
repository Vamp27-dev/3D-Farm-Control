alerts = []

def add_alert(alert):
    alerts.append(alert)

def pop_alerts():
    global alerts
    data = alerts.copy()
    alerts = []
    return data
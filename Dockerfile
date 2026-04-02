# lastest version of python3 (2026-04-02)
FROM python:3.12.0-slim-buster

# სამუშაო დირექტორია
WORKDIR /app

# აპლიკაციის კოდის კოპირება
COPY . .

# მოთხოვნილებების ინსტალაცია
RUN pip install --upgrade pip
RUN apt-get update && apt-get -y install python3-dev gcc build-essential
RUN pip install -r requirements.txt

RUN chmod +x /app/reset_db.sh

# საჭირო იქნება, რომ გადაიტანოთ ლოგების ფაილი
RUN mkdir -p /app/logs

# 5000 პორტის გახსნა
EXPOSE 5000

CMD ["uwsgi", "uwsgi.ini"]
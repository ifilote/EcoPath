# EcoPath

## What is this application?
EcoPath is a simple and intuitive web application designed to encourage people to choose greener, more sustainable ways of traveling. It helps you track your daily trips and shows you the positive impact of your choices. Instead of just showing you the route from point A to point B, EcoPath highlights how much you help the environment by reducing carbon emissions and how much you help your own health by burning calories. 

## Key Features
- **Trip Tracking & History:** Record all your daily commutes and view a detailed history of your past trips.
- **Personal Statistics:** Track your progress over time with statistics on total distance covered, calories burned, and CO2 saved.
- **Community Leaderboard:** See how you rank against other users based on the amount of CO2 you've saved, adding a fun and competitive element to being eco-friendly.

## Technologies Used
- **Backend:** C# with ASP.NET Core MVC (.NET 9.0)
- **Database:** SQLite with Entity Framework Core
- **Frontend:** HTML, CSS, JavaScript
- **Mapping & Routing:** Google Maps API (for calculating distances and tracking routes)

## How We Calculate Your Impact

### CO2 Saved
We calculate the amount of CO2 you save by comparing your chosen transport method to driving a standard car. We assume that a standard car emits **0.12 kg of CO2 per kilometer**. 

Depending on how you travel, you save a specific amount of CO2 for every kilometer:
- **Walking & Biking:** Save 0.12 kg/km (Zero emissions, maximum savings)
- **Metro:** Save 0.09 kg/km (Emits 0.03 kg/km)
- **Tram:** Save 0.08 kg/km (Emits 0.04 kg/km)
- **Bus:** Save 0.06 kg/km (Emits 0.06 kg/km)
- **Car:** Save 0 kg/km (This is the baseline, so no savings)

### Calories Burned
We provide a simple estimate of the calories you burn based on the distance you travel, but only for active transport methods:
- **Walking:** Burns approximately **60 calories per kilometer**.
- **Biking:** Burns approximately **30 calories per kilometer**.
- **Other methods (Car, Bus, Metro, Tram):** 0 calories burned.

import os
import requests
import pandas as pd
import streamlit as st
from datetime import datetime, timedelta
import json
import folium
from streamlit_folium import st_folium
import plotly.express as px
import plotly.graph_objects as go
from functools import lru_cache
from time import time

# ─── Configuration ───
st.set_page_config(
    page_title="Siaga Bulukumba",
    page_icon="🌊",
    layout="wide",
    initial_sidebar_state="expanded",
)

API_BASE = os.environ.get("API_URL", "http://localhost:4000")
MAP_CENTER = [-5.5544, 120.1980]
CACHE_TTL = 30  # seconds

# ─── Caching ───
_cache = {}

def cached_get(path, ttl=CACHE_TTL):
    """Fetch from API with simple caching."""
    key = (path, ttl)
    now = time()
    if key in _cache and now - _cache[key]["ts"] < ttl:
        return _cache[key]["data"]
    try:
        r = requests.get(f"{API_BASE}{path}", timeout=10)
        if r.ok:
            data = r.json()
            _cache[key] = {"data": data, "ts": now}
            return data
        else:
            st.warning(f"⚠️ API error {r.status_code}: {r.text[:100]}")
            return None
    except requests.ConnectionError:
        st.error(f"🔌 Tidak dapat terhubung ke backend di **{API_BASE}**")
        return None
    except requests.Timeout:
        st.error("⏱️ Koneksi ke backend timeout. Coba lagi nanti.")
        return None
    except Exception as e:
        st.error(f"❌ Error: {e}")
        return None

# ─── Helpers ───

def depth_color(d):
    if not d or d == 0:
        return "#cccccc"
    if d <= 20:
        return "#ccf2ff"
    if d <= 50:
        return "#66ccff"
    if d <= 100:
        return "#0066cc"
    return "#003366"


def depth_label(d):
    if not d or d == 0:
        return "Tidak ada data"
    if d <= 20:
        return "Rendah"
    if d <= 50:
        return "Sedang"
    if d <= 100:
        return "Tinggi"
    return "Bahaya"


def safe_int(val, default=0):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def safe_float(val, default=0.0):
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


WEATHER_MAP = {
    0: "Cerah", 1: "Cerah Berawan", 2: "Berawan", 3: "Berawan Tebal",
    60: "Hujan Ringan", 61: "Hujan Sedang", 63: "Hujan Lebat",
    80: "Hujan Lokal", 95: "Hujan Petir", 97: "Hujan Petir Lebat",
}

# ─── Pages ───

def page_dashboard():
    st.title("📊 Dashboard Banjir Bulukumba")

    # Try backend first, then fallback to seed data display
    stats = cached_get("/api/reports/stats", ttl=10)

    if stats:
        col1, col2, col3, col4, col5 = st.columns(5)
        col1.metric("Total Laporan", stats.get("total", 0))
        col2.metric("Terverifikasi", stats.get("verified", 0))
        col3.metric("Rata-rata Kedalaman", f"{stats.get('avgDepth', 0)} cm")
        col4.metric("Maksimum", f"{stats.get('maxDepth', 0)} cm")
        col5.metric("Hari Ini", stats.get("today", 0))
    else:
        st.info("Gunakan seed data untuk demo.")
        # Will show empty metrics if backend unreachable
        col1, col2, col3, col4, col5 = st.columns(5)
        col1.metric("Total Laporan", "?")
        col2.metric("Terverifikasi", "?")
        col3.metric("Rata-rata Kedalaman", "?")
        col4.metric("Maksimum", "?")
        col5.metric("Hari Ini", "?")
        st.stop()

    st.divider()

    reports = cached_get("/api/reports?limit=500", ttl=15)
    if reports:
        rows = reports if isinstance(reports, list) else reports.get("rows", [])
    else:
        rows = []

    if rows:
        df = pd.DataFrame(rows)
        df["created_at"] = pd.to_datetime(df["created_at"])
        df["depth_group"] = df["water_depth"].apply(depth_label)
        df["date"] = df["created_at"].dt.date

        col1, col2 = st.columns(2)
        with col1:
            depth_counts = df["depth_group"].value_counts()
            fig = px.pie(
                values=depth_counts.values,
                names=depth_counts.index,
                title="Distribusi Kedalaman Banjir",
                color_discrete_map={
                    "Rendah": "#ccf2ff",
                    "Sedang": "#66ccff",
                    "Tinggi": "#0066cc",
                    "Bahaya": "#003366",
                    "Tidak ada data": "#cccccc",
                },
            )
            st.plotly_chart(fig, use_container_width=True)

        with col2:
            daily = df.groupby("date").size().reset_index(name="jumlah")
            fig2 = px.bar(
                daily, x="date", y="jumlah",
                title="Laporan per Hari",
                color_discrete_sequence=["#0066cc"],
            )
            st.plotly_chart(fig2, use_container_width=True)

        st.divider()
        st.subheader("📍 Lokasi dengan Laporan Terbanyak")
        top_locs = stats.get("byLocation", [])
        if top_locs:
            loc_df = pd.DataFrame(top_locs)
            fig3 = px.bar(
                loc_df.head(10),
                x="count", y="location_name",
                orientation="h", color="avg_depth",
                color_continuous_scale="Blues",
                labels={
                    "count": "Jumlah",
                    "location_name": "Lokasi",
                    "avg_depth": "Rata-rata Kedalaman (cm)",
                },
            )
            st.plotly_chart(fig3, use_container_width=True)

            # Top locations table
            with st.expander("📋 Detail per Lokasi"):
                st.dataframe(
                    loc_df,
                    column_config={
                        "location_name": "Lokasi",
                        "count": "Jumlah Laporan",
                        "avg_depth": st.column_config.NumberColumn(
                            "Rata-rata Kedalaman",
                            format="%.1f cm",
                        ),
                    },
                    use_container_width=True,
                    hide_index=True,
                )
    else:
        st.info("Belum ada laporan banjir.")


def page_map():
    st.title("🗺️ Peta Genangan Banjir")

    reports = cached_get("/api/reports?limit=500", ttl=15)
    rows = reports if isinstance(reports, list) else reports.get("rows", []) if reports else []

    # Load GeoJSON
    kelurahan_geojson = None
    local_path = os.path.join(
        os.path.dirname(__file__),
        "frontend", "public", "data", "kelurahan-ujungbulu.geojson"
    )
    if os.path.exists(local_path):
        with open(local_path) as f:
            kelurahan_geojson = json.load(f)
    else:
        try:
            r = requests.get(
                f"{API_BASE}/data/kelurahan-ujungbulu.geojson",
                timeout=10
            )
            if r.ok:
                kelurahan_geojson = r.json()
        except Exception:
            pass

    with st.expander("ℹ️ Tentang Peta Ini", expanded=False):
        st.markdown("""
        - **Marker biru** — laporan terverifikasi
        - **Marker abu-abu** — laporan menunggu verifikasi
        - **Warna polygon** — rata-rata kedalaman per kelurahan
        - Klik marker untuk detail laporan
        """)

    m = folium.Map(location=MAP_CENTER, zoom_start=14, control_scale=True)

    # Kelurahan boundaries
    if kelurahan_geojson:
        # Compute average depth per kelurahan
        kel_depths = {}
        if rows:
            for r in rows:
                loc = r.get("location_name", "")
                d = safe_int(r.get("water_depth", 0))
                if loc and d > 0:
                    if loc not in kel_depths:
                        kel_depths[loc] = []
                    kel_depths[loc].append(d)

        for feature in kelurahan_geojson.get("features", []):
            name = feature["properties"].get("wadmkd") or feature["properties"].get("namobj", "")

            # Find matching depth
            avg_d = 0
            for loc, depths in kel_depths.items():
                if name.lower() in loc.lower() or loc.lower() in name.lower():
                    avg_d = sum(depths) / len(depths)
                    break

            style = {
                "fillColor": depth_color(avg_d),
                "color": "#2c3e50",
                "weight": 1.5,
                "fillOpacity": 0.3,
            }

            popup_text = (
                f"<b>{name}</b><br>Rata-rata kedalaman: {avg_d:.0f} cm"
                if avg_d > 0
                else f"<b>{name}</b><br>Tidak ada laporan"
            )

            gj = folium.GeoJson(
                feature,
                style_function=lambda x, s=style: s,
                popup=folium.Popup(popup_text, max_width=250),
            )
            gj.add_to(m)

    # Report markers
    for r in rows:
        lat = safe_float(r.get("latitude"))
        lng = safe_float(r.get("longitude"))
        if not lat or not lng:
            continue

        verified = r.get("verified") == 1 or r.get("verified") == "1"
        depth = safe_int(r.get("water_depth", 0))
        loc = r.get("location_name", "Tidak diketahui") or "Tidak diketahui"
        time_str = r.get("created_at", "")
        desc = r.get("description", "")
        icon_color = "#1e90ff" if verified else "#95a5a6"

        popup_html = f"""
        <div style="font-family:sans-serif;font-size:13px;min-width:180px">
            <b style="color:#0d6efd">{loc}</b><br>
            <small>{time_str}</small><br>
            <span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:8px;
                background:{depth_color(depth)};color:white;">
                💧 {depth} cm — {depth_label(depth)}
            </span><br>
            <span style="color:{'green' if verified else 'orange'}">
                {'✅ Terverifikasi' if verified else '⏳ Menunggu'}
            </span>
            {f'<p style="margin-top:4px;font-size:12px">{desc}</p>' if desc else ''}
        </div>
        """

        folium.CircleMarker(
            location=[lat, lng],
            radius=6 + depth * 0.12,
            color=icon_color,
            fill=True,
            fillOpacity=0.8,
            popup=folium.Popup(popup_html, max_width=250),
            tooltip=f"{loc} — {depth} cm",
        ).add_to(m)

    st_folium(m, width=None, height=600)

    if rows:
        st.divider()
        st.subheader("📋 Data Laporan di Peta")
        df = pd.DataFrame(rows)
        df["status"] = df["verified"].apply(
            lambda v: "Terverifikasi" if v == 1 or v == "1" else "Menunggu"
        )
        df["kedalaman"] = df["water_depth"].apply(
            lambda d: f"{d} cm — {depth_label(d)}"
        )
        st.dataframe(
            df[["location_name", "kedalaman", "status", "created_at"]].rename(
                columns={
                    "location_name": "Lokasi",
                    "kedalaman": "Kedalaman",
                    "status": "Status",
                    "created_at": "Waktu",
                }
            ),
            use_container_width=True,
            hide_index=True,
        )


def page_reports():
    st.title("📋 Laporan Banjir")

    col1, col2 = st.columns([1, 2])
    with col1:
        status_filter = st.selectbox(
            "Filter Status", ["Semua", "Terverifikasi", "Menunggu"], index=0
        )
    with col2:
        depth_filter = st.selectbox(
            "Filter Kedalaman",
            ["Semua", "Rendah (0-20cm)", "Sedang (20-50cm)", "Tinggi (50-100cm)", "Bahaya (>100cm)"],
            index=0,
        )

    # Build query params
    params = "?limit=100"
    if status_filter == "Terverifikasi":
        params += "&verified=1"
    elif status_filter == "Menunggu":
        params += "&verified=0"

    depth_ranges = {
        "Semua": None,
        "Rendah (0-20cm)": (0, 20),
        "Sedang (20-50cm)": (20, 50),
        "Tinggi (50-100cm)": (50, 100),
        "Bahaya (>100cm)": (100, 500),
    }
    depth_range = depth_ranges.get(depth_filter)
    if depth_range:
        params += f"&min_depth={depth_range[0]}&max_depth={depth_range[1]}"

    reports = cached_get(f"/api/reports{params}", ttl=10)
    if not reports:
        st.info("Belum ada laporan banjir.")
        return

    rows = reports if isinstance(reports, list) else reports.get("rows", [])

    if not rows:
        st.info("Tidak ada laporan dengan filter saat ini.")
        return

    # Paginate results
    items_per_page = 20
    total_pages = max(1, (len(rows) + items_per_page - 1) // items_per_page)
    page_num = st.number_input(
        "Halaman", min_value=1, max_value=total_pages, value=1
    )
    start_idx = (page_num - 1) * items_per_page
    end_idx = min(start_idx + items_per_page, len(rows))

    for i in range(start_idx, end_idx):
        r = rows[i]
        cols = st.columns([1, 3])
        with cols[0]:
            st.markdown(
                f"<div style='text-align:center;padding:10px;border-radius:10px;"
                f"background:{depth_color(r.get('water_depth', 0))};"
                f"color:white;font-size:24px;font-weight:bold'>"
                f"{r.get('water_depth', '?')}<br><small>cm</small></div>",
                unsafe_allow_html=True,
            )
        stat = "✅ Terverifikasi" if r.get("verified") in [1, "1"] else "⏳ Menunggu"
        with cols[1]:
            st.markdown(f"**{r.get('location_name') or 'Tidak diketahui'}**")
            st.caption(f"{r.get('created_at', '?')} — {stat}")
            if r.get("description"):
                st.markdown(f"_{r['description']}_")

        if i < end_idx - 1:
            st.divider()

    if total_pages > 1:
        st.markdown(f"*Halaman {page_num} dari {total_pages} ({len(rows)} laporan)*")


def page_weather():
    st.title("🌤️ Informasi Cuaca BMKG")
    st.caption("Sumber: BMKG — Stasiun Meteorologi Bulukumba")

    try:
        w = cached_get("/api/weather/current", ttl=180)  # 3 min cache
        if w and w.get("temperature_c") is not None:
            is_rainy = w.get("weather_code", 0) in [60, 61, 63, 80, 95, 96, 97]
            emoji = "🌧️" if is_rainy else "☀️"
            bg_color = "#dc3545" if is_rainy else "#0d6efd"

            st.markdown(
                f"<div style='padding:20px;border-radius:12px;"
                f"background:{bg_color};color:white;text-align:center'>"
                f"<h2 style='margin:0;font-size:48px'>{emoji}</h2>"
                f"<h3 style='margin:8px 0'>{w.get('description', 'Tidak diketahui')}</h3>"
                f"<p style='font-size:24px;margin:0'>{w.get('temperature_c', '?')}°C</p>"
                f"</div>",
                unsafe_allow_html=True,
            )

            col1, col2, col3 = st.columns(3)
            col1.metric("Kelembaban", f"{w.get('humidity_pct', '?')}%")
            col2.metric("Kecepatan Angin", f"{w.get('wind_speed_kmh', '?')} km/h")
            col3.metric("Tekanan Udara", f"{w.get('pressure_mb', '?')} mb")

            st.divider()
            st.subheader("📅 Prakiraan Cuaca")
            try:
                forecast = cached_get("/api/weather/forecast", ttl=300)
                if forecast and isinstance(forecast, dict) and forecast.get("data"):
                    fc = forecast["data"]
                    if isinstance(fc, list) and len(fc) > 0:
                        fc_df = pd.DataFrame(fc)
                        if "datetime" in fc_df.columns:
                            fc_df["datetime"] = pd.to_datetime(fc_df["datetime"])
                            fc_df["Cuaca"] = fc_df.get("weather_code", pd.Series()).apply(
                                lambda c: WEATHER_MAP.get(c, f"Kode {c}")
                            )
                            fc_df["Suhu (°C)"] = fc_df.get("temperature_c", pd.Series())
                            st.dataframe(
                                fc_df[["datetime", "Cuaca", "Suhu (°C)"]].rename(
                                    columns={"datetime": "Waktu"}
                                ),
                                use_container_width=True,
                                hide_index=True,
                            )
            except Exception as e:
                st.warning(f"Prakiraan cuaca tidak tersedia saat ini.")
        else:
            st.info("Data cuaca tidak tersedia saat ini. Coba lagi nanti.")

    except Exception as e:
        st.error(f"Gagal memuat data cuaca: {e}")


# ─── Main ───

def main():
    st.sidebar.markdown("# 🌊 Siaga Bulukumba")
    st.sidebar.markdown("Sistem Informasi Banjir Kota Bulukumba")
    st.sidebar.divider()

    page = st.sidebar.radio("Menu", ["Dashboard", "Peta", "Laporan", "Cuaca"])

    # Connection status
    try:
        health = cached_get("/api/health", ttl=5)
        if health and health.get("status") == "ok":
            st.sidebar.success("✅ Backend terhubung")
        else:
            st.sidebar.warning("⚠️ Backend tidak merespon")
    except Exception:
        st.sidebar.error("🔌 Backend offline")

    st.sidebar.divider()

    if page == "Dashboard":
        page_dashboard()
    elif page == "Peta":
        page_map()
    elif page == "Laporan":
        page_reports()
    elif page == "Cuaca":
        page_weather()

    st.sidebar.caption(f"Backend: {API_BASE}")
    st.sidebar.caption(f"© 2026 Siaga Bulukumba v2.1.0")


if __name__ == "__main__":
    main()
